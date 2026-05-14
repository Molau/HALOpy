"""Observation CRUD API endpoints.

Routes: /observations (GET/POST), /observations/search, /observations/delete,
        /observations/replace, /observations/save, /observations/filter

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

import mimetypes
import os
from io import BytesIO
from urllib.parse import quote
from typing import Dict, Any

from flask import jsonify, request, current_app, session, Response

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.models.constants import (
    DEFAULT_OBSERVATION_LIMIT,
    PHOTO_ALLOWED_EXTENSIONS,
    PHOTO_MAX_FILE_SIZE_BYTES,
    PHOTO_MAX_FILES_PER_OBSERVATION,
)
import halo.io.observations as obs_logic
import halo.io.observations_file as obs_file
import halo.io.observations_db as obs_db
from ._helpers import _check_cloud_write_auth, _int, _obs_to_json, _spaeter


PHOTO_BUCKET_NAME = os.getenv('HALOPY_PHOTO_BUCKET', 'halophotos')


def _get_s3_client():
    """Create an S3 client using the active AWS credentials (EC2 role in cloud mode)."""
    # Inline import keeps local installations without boto3 working.
    import boto3  # type: ignore
    return boto3.client('s3')


def _observation_photo_prefix(jj: int, mm: int, tt: int, kk: int) -> str:
    """Return object key prefix for an observation photo folder."""
    return f"{jj:04d}/{mm:02d}/{tt:02d}/kk{kk:02d}"


def _extract_kk_from_photo_key(key: str):
    """Extract KK from key path .../kkXX/...; return None if not parseable."""
    parts = key.split('/')
    if len(parts) < 4:
        return None
    kk_part = parts[3].lower()
    if not kk_part.startswith('kk') or len(kk_part) < 4:
        return None
    try:
        return int(kk_part[2:4])
    except ValueError:
        return None


def _thumbnail_key_for_photo(key: str) -> str:
    """Return thumbnail key using *_tn.<ext> naming in the same folder."""
    if '/' in key:
        folder, filename = key.rsplit('/', 1)
    else:
        folder, filename = '', key

    stem, ext = os.path.splitext(filename)
    thumb_name = f"{stem}_tn{ext}"
    return f"{folder}/{thumb_name}" if folder else thumb_name


def _is_thumbnail_key(key: str) -> bool:
    """Return True when object key uses *_tn.<ext> naming."""
    filename = key.rsplit('/', 1)[-1]
    stem, _ = os.path.splitext(filename)
    return stem.lower().endswith('_tn')


def _generate_thumbnail_bytes(image_bytes: bytes, source_key: str):
    """Generate thumbnail bytes and content type for an image object."""
    from PIL import Image  # type: ignore

    ext = os.path.splitext(source_key)[1].lower()
    format_map = {
        '.jpg': 'JPEG',
        '.jpeg': 'JPEG',
        '.png': 'PNG',
        '.gif': 'GIF',
        '.webp': 'WEBP',
        '.bmp': 'BMP',
        '.tif': 'TIFF',
        '.tiff': 'TIFF',
    }
    out_format = format_map.get(ext, 'JPEG')

    with Image.open(BytesIO(image_bytes)) as img:
        resampling = Image.Resampling.LANCZOS if hasattr(Image, 'Resampling') else Image.LANCZOS
        img.thumbnail((320, 240), resampling)

        if out_format == 'JPEG' and img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')

        out = BytesIO()
        save_kwargs = {'format': out_format}
        if out_format == 'JPEG':
            save_kwargs['quality'] = 82
            save_kwargs['optimize'] = True
        img.save(out, **save_kwargs)

    content_type = mimetypes.guess_type(f"x{ext}")[0] or 'image/jpeg'
    return out.getvalue(), content_type


def _check_cloud_photo_read_auth(kk: int):
    """Restrict cloud-mode photo access to own observer (unless admin)."""
    if not is_cloud_mode():
        return None

    fixed_observer = session.get('observer_kk')
    if fixed_observer is None:
        return None

    if str(kk).zfill(2) != str(fixed_observer).zfill(2):
        return jsonify({'error': 'forbidden'}), 403

    return None


@api_blueprint.route('/observations', methods=['GET'])
def get_observations() -> Dict[str, Any]:
    """
    Get observations with optional pagination.
    
    - Cloud Mode: Read directly from database (Layer 3b)
    - Local Mode: Read from in-memory data loaded via /file/upload or /file/load

    Query parameters:
    - limit: Maximum number of results (default from constants.DEFAULT_OBSERVATION_LIMIT, <=0 returns all)
    - offset: Pagination offset (default 0)
    """
    limit = int(request.args.get('limit', DEFAULT_OBSERVATION_LIMIT))
    offset = int(request.args.get('offset', 0))

    # Layer 3: Get observations from storage
    if is_cloud_mode():
        # Cloud Mode: Use SQL filtering for performance (Layer 3b)
        # Read from session (per-user), not app.config (shared across all users)
        fixed_observer = session.get('observer_kk')  # None for admin, KK for regular users
        
        # Load filtered observations (with Fixed Observer filter if set)
        if fixed_observer:
            observations = obs_db.load_filtered(kk=int(fixed_observer))
        else:
            observations = obs_db.load_all()
        
        # Database already returns sorted observations (ORDER BY in SQL)
        # No Python sorting needed
        
        # Apply pagination in Python (since SQL pagination not yet implemented)
        total = len(observations)
        if limit <= 0:
            paginated = observations[offset:]
        else:
            paginated = observations[offset:offset + limit]
        
        loaded_file = None
    else:
        # Local Mode: Read from in-memory data (Layer 3a via app.config)
        observations = current_app.config.get('OBSERVATIONS') or []
        loaded_file = current_app.config.get('LOADED_FILE')
        
        total = len(observations)
        # Support limit <= 0 meaning "fetch all" from the current offset
        if limit <= 0:
            paginated = observations[offset:]
        else:
            paginated = observations[offset:offset + limit]

    result = {
        'total': total,
        'offset': offset,
        'limit': limit,
        'count': len(paginated),
        'file': loaded_file,
        'observations': [_obs_to_json(obs) for obs in paginated],
    }

    return jsonify(result)


@api_blueprint.route('/observations/search', methods=['POST'])
def search_observations() -> Dict[str, Any]:
    """Search observations server-side using SQL (cloud) or Python (local).
    
    Accepts filter criteria matching the two-stage filter dialog:
    - criterion1: 'observer' or 'region' with value1
    - criterion2: 'date', 'month', 'year', or 'halo-type' with value2
    - limit: Maximum number of results to return (default: all)
    - offset: Number of results to skip (default: 0)
    
    Returns filtered observations as JSON with pagination support.
    Response includes 'total' (total matching count) so client can paginate
    without loading all data.
    """
    data = request.get_json() or {}
    criterion1 = data.get('criterion1')
    value1 = data.get('value1')
    criterion2 = data.get('criterion2')
    value2 = data.get('value2')
    limit = data.get('limit')  # None = return all
    offset = data.get('offset', 0) or 0
    
    if is_cloud_mode():
        # Cloud Mode: Build SQL filters for load_filtered()
        filters = {}
        
        # First criterion
        if criterion1 == 'observer' and value1 is not None:
            filters['kk'] = int(value1)
        elif criterion1 == 'region' and value1 is not None:
            filters['gg'] = int(value1)
        
        # Second criterion
        if criterion2 == 'date' and value2:
            if value2.get('t') is not None:
                filters['tt'] = int(value2['t'])
            if value2.get('m') is not None:
                filters['mm'] = int(value2['m'])
            if value2.get('j') is not None:
                filters['jj'] = int(value2['j'])
        elif criterion2 == 'month' and value2:
            if value2.get('m') is not None:
                filters['mm'] = int(value2['m'])
            if value2.get('j') is not None:
                filters['jj'] = int(value2['j'])
        elif criterion2 == 'year' and value2 is not None:
            filters['jj'] = int(value2)
        elif criterion2 == 'halo-type' and value2 is not None:
            filters['ee'] = int(value2)
        
        observations = obs_db.load_filtered(**filters) if filters else obs_db.load_all()
    else:
        # Local Mode: Filter in Python (still faster than sending all to browser)
        observations = current_app.config.get('OBSERVATIONS') or []
        
        def matches(obs):
            if criterion1 == 'observer' and value1 is not None:
                if _int(obs, 'KK') != int(value1):
                    return False
            elif criterion1 == 'region' and value1 is not None:
                if _int(obs, 'GG') != int(value1):
                    return False
            
            if criterion2 == 'date' and value2:
                if value2.get('t') is not None and _int(obs, 'TT') != int(value2['t']):
                    return False
                if value2.get('m') is not None and _int(obs, 'MM') != int(value2['m']):
                    return False
                if value2.get('j') is not None and _int(obs, 'JJ') != int(value2['j']):
                    return False
            elif criterion2 == 'month' and value2:
                if value2.get('m') is not None and _int(obs, 'MM') != int(value2['m']):
                    return False
                if value2.get('j') is not None and _int(obs, 'JJ') != int(value2['j']):
                    return False
            elif criterion2 == 'year' and value2 is not None:
                if _int(obs, 'JJ') != int(value2):
                    return False
            elif criterion2 == 'halo-type' and value2 is not None:
                if _int(obs, 'EE') != int(value2):
                    return False
            return True
        
        observations = [obs for obs in observations if matches(obs)]
    
    # Total count before pagination (for client-side pagination controls)
    total = len(observations)
    
    # Apply pagination if limit is specified
    if limit is not None:
        limit = int(limit)
        offset = int(offset)
        paginated = observations[offset:offset + limit]
    else:
        paginated = observations
    
    return jsonify({
        'observations': [_obs_to_json(obs) for obs in paginated],
        'total': total,
        'count': len(paginated),
        'offset': offset,
        'limit': limit
    })


@api_blueprint.route('/observations', methods=['POST'])
def add_observation() -> Dict[str, Any]:
    """Add a new observation to the in-memory list or database (Zahleneingabe)."""
    
    data = request.get_json() or {}

    # Minimal validation
    required_fields = ['KK','O','JJ','MM','TT','GG','EE','g']
    for f in required_fields:
        if f not in data:
            return jsonify({'error': f'Missing field: {f}'}), 400

    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(data.get('KK'))
    if auth_error:
        return auth_error

    try:
        # Build observation dict from JSON data
        obs = {}
        for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
            val = data.get(field)
            obs[field] = str(val) if val is not None else ''
        obs['sectors'] = data.get('sectors', '') or ''
        obs['remarks'] = data.get('remarks', '') or ''

        # Server-side field validation (HALO_DATA_FORMAT ranges & dependencies)
        is_valid, validation_errors = obs_logic.validate_observation(obs)
        if not is_valid:
            return jsonify({'error': 'validation_failed', 'details': validation_errors}), 400

        if is_cloud_mode():
            # Cloud Mode: Save to database (Layer 3b)
            success = obs_db.save_one(obs)
            if not success:
                return jsonify({'error': 'duplicate'}), 409
            
            # Get count directly from database (no caching)
            count = obs_db.count()
            return jsonify({'success': True, 'count': count})
        else:
            # Local Mode: In-memory operations
            observations = current_app.config.get('OBSERVATIONS') or []
            
            # Check for duplicate observation using spaeter() comparison
            for existing in observations:
                if _spaeter(obs, existing) == 0:
                    # All key fields match - this is a duplicate
                    return jsonify({'error': 'duplicate'}), 409
            
            # Find correct insertion position using spaeter() comparison
            insert_pos = len(observations)
            for i, existing in enumerate(observations):
                if _spaeter(obs, existing) < 1:  # obs comes before or equal to existing
                    insert_pos = i
                    break
            
            observations.insert(insert_pos, obs)
            current_app.config['OBSERVATIONS'] = observations
            current_app.config['DIRTY'] = True

            return jsonify({'success': True, 'count': len(observations)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@api_blueprint.route('/observations/delete', methods=['POST'])
def delete_observation() -> Dict[str, Any]:
    """Delete an observation by matching its field values."""
    data = request.get_json() or {}

    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(data.get('KK'))
    if auth_error:
        return auth_error

    try:
        if is_cloud_mode():
            # Cloud Mode: Delete from database (Layer 3b)
            # Convert 4-digit JJ to 2-digit for DB matching
            jj_raw = data.get('JJ')
            jj_db = int(jj_raw) % 100 if jj_raw is not None else None
            key = (
                data.get('KK'), data.get('O'), jj_db,
                data.get('MM'), data.get('TT'), data.get('g'),
                data.get('ZS'), data.get('ZM'), data.get('EE')
            )
            success = obs_db.delete_one(key)
            
            # Get count directly from database (no caching)
            count = obs_db.count()
            return jsonify({
                'success': True,
                'deleted': success,
                'count': count
            })
        else:
            # Local Mode: Delete from in-memory list
            observations = current_app.config.get('OBSERVATIONS') or []
            
            # Find observation to delete using canonical key function
            target_key = obs_logic.make_observation_key(data)
            original_obs = None
            for i, obs in enumerate(observations):
                if obs_logic.make_observation_key(obs) == target_key:
                    original_obs = i
                    break
            
            if original_obs is not None:
                observations.pop(original_obs)
                current_app.config['OBSERVATIONS'] = observations
                current_app.config['DIRTY'] = True
                return jsonify({'success': True, 'deleted': True, 'count': len(observations)})
            else:
                return jsonify({'success': False, 'deleted': False, 'count': len(observations)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@api_blueprint.route('/observations/replace', methods=['POST'])
def replace_observations() -> Dict[str, Any]:
    """Replace all observations in memory with provided list.
    
    Used by Datei -> Selektieren to load filtered observations before save.
    """
    data = request.get_json() or {}
    observations_data = data.get('observations', [])
    
    # Convert observation dicts to observation dicts with string values
    observations = []
    for obs_dict in observations_data:
        obs = {}
        for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
            val = obs_dict.get(field)
            obs[field] = str(val) if val is not None else ''
        obs['sectors'] = obs_dict.get('sectors', '') or ''
        obs['remarks'] = obs_dict.get('remarks', '') or ''
        observations.append(obs)
    
    previous_count = len(current_app.config.get('OBSERVATIONS', []))
    current_app.config['OBSERVATIONS'] = observations
    # Only mark dirty if the number of observations actually changed
    if len(observations) != previous_count:
        current_app.config['DIRTY'] = True
    
    return jsonify({'success': True, 'count': len(observations)})


@api_blueprint.route('/observations/save', methods=['POST'])
def save_observations() -> Dict[str, Any]:
    """Save filtered observations to a new file.
    
    Used by Datei -> Selektieren to save filtered observation list.
    """
    data = request.get_json() or {}
    filename = data.get('filename', '')
    observations_data = data.get('observations', [])
    overwrite = data.get('overwrite', False)
    
    if not filename:
        return jsonify({'error': 'filename_required'}), 400
    
    # Ensure .csv extension
    if not filename.lower().endswith('.csv'):
        filename += '.csv'
    
    # Convert observation dicts to observation dicts with string values
    observations = []
    for obs_dict in observations_data:
        obs = {}
        for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
            val = obs_dict.get(field)
            obs[field] = str(val) if val is not None else ''
        obs['sectors'] = obs_dict.get('sectors', '') or ''
        obs['remarks'] = obs_dict.get('remarks', '') or ''
        observations.append(obs)
    
    # Write to file
    filepath = obs_file.get_data_path(filename)
    
    # Check if file exists
    if filepath.exists() and not overwrite:
        return jsonify({'success': False, 'exists': True, 'filename': filename}), 200
    
    try:
        obs_file.save_file(observations, filepath)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'count': len(observations)
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/filter', methods=['POST'])
def filter_observations() -> Dict[str, Any]:
    """
    Filter observations server-side for Datei -> Selektieren.
    Applies the filter directly in backend storage (memory or database).
    No observation data is sent to or from the frontend.
    
    Handles ALL filter types: KK, MM, TT, ZZ, SH, GG, O, EE, DD, N, C, H, F, V.
    
    Request body:
        - filter_type: Parameter to filter by (KK, MM, TT, ZZ, SH, etc.)
        - action: 'keep' or 'delete'
        - value: Filter value (for single-value filters like KK, GG, O, etc.)
        - from/to: Range values (for ZZ, SH)
        - month/year: For MM filter
        - day/month/year: For TT filter
        - sh_time: For SH filter ('min', 'mean', 'max')
    
    Returns:
        JSON object with:
        - success: True if filter was applied
        - kept_count: Number of observations kept
        - deleted_count: Number of observations deleted
    """
    
    try:
        params = request.get_json()
        filter_type = params.get('filter_type')
        action = params.get('action', 'keep')
        
        # Layer 3: Get observations from storage
        if is_cloud_mode():
            # Cloud Mode: Use SQL filtering for performance (Layer 3b)
            # Build filter dict for load_filtered()
            sql_filters = {}
            
            if filter_type == 'KK':
                sql_filters['kk'] = int(params.get('value'))
            elif filter_type == 'MM':
                sql_filters['mm'] = int(params.get('month'))
                sql_filters['jj'] = int(params.get('year')) % 100
            elif filter_type == 'TT':
                sql_filters['tt'] = int(params.get('day'))
                sql_filters['mm'] = int(params.get('month'))
                sql_filters['jj'] = int(params.get('year')) % 100
            elif filter_type == 'JJ':
                sql_filters['jj'] = int(params.get('value')) % 100
            elif filter_type in ['GG', 'O', 'EE', 'DD', 'N', 'C', 'H', 'F', 'V']:
                sql_filters[filter_type.lower()] = int(params.get('value'))
            elif filter_type == 'ZZ':
                sql_filters = None  # Fall back to Python filtering
            elif filter_type == 'SH':
                sql_filters = None  # Fall back to Python filtering
            
            # Use SQL filtering when possible
            if sql_filters:
                matching_obs = obs_db.load_filtered(**sql_filters)
                all_obs = None
            else:
                observations = obs_db.load_all()
                all_obs = observations
                matching_obs = []
        else:
            # Local Mode: Read from in-memory cache
            observations = current_app.config.get('OBSERVATIONS', [])
            if not observations:
                return jsonify({'error': 'no_observations_loaded'}), 400
            all_obs = observations
            matching_obs = []
        
        # Load observers for SH filtering
        observers_list = current_app.config.get('OBSERVERS', [])
        
        # Python-side filtering (only for Local Mode or complex Cloud-Mode filters)
        if not (is_cloud_mode() and sql_filters):
            observations = all_obs
            
            if filter_type == 'KK':
                value = int(params.get('value'))
                matching_obs = [obs for obs in observations if _int(obs, 'KK') == value]
                
            elif filter_type == 'MM':
                month = int(params.get('month'))
                year = int(params.get('year'))
                year_2digit = year % 100
                matching_obs = [obs for obs in observations if _int(obs, 'MM') == month and _int(obs, 'JJ') == year_2digit]
                
            elif filter_type == 'TT':
                day = int(params.get('day'))
                month = int(params.get('month'))
                year = int(params.get('year'))
                year_2digit = year % 100
                matching_obs = [obs for obs in observations if _int(obs, 'TT') == day and _int(obs, 'MM') == month and _int(obs, 'JJ') == year_2digit]
                
            elif filter_type == 'ZZ':
                from_hour = int(params.get('from_hour'))
                from_minute = int(params.get('from_minute'))
                to_hour = int(params.get('to_hour'))
                to_minute = int(params.get('to_minute'))
                from_time = from_hour * 60 + from_minute
                to_time = to_hour * 60 + to_minute
                for obs in observations:
                    zs = _int(obs, 'ZS', -1)
                    zm = _int(obs, 'ZM', -1)
                    if zs != -1 and zm != -1:
                        obs_time = zs * 60 + zm
                        if from_time <= obs_time <= to_time:
                            matching_obs.append(obs)
                            
            elif filter_type == 'SH':
                sh_from = int(params.get('from', -90))
                sh_to = int(params.get('to', 90))
                sh_time = params.get('sh_time', 'mean')
                for obs in observations:
                    altitude = _calculate_observation_solar_altitude(obs, observers_list, sh_time)
                    if altitude is not None and sh_from <= altitude <= sh_to:
                        matching_obs.append(obs)
            
            elif filter_type == 'JJ':
                value = int(params.get('value'))
                year_2digit = value % 100
                matching_obs = [obs for obs in observations if _int(obs, 'JJ') == year_2digit]
                        
            else:
                # Simple value match (GG, O, EE, DD, N, C, H, F, V)
                value = int(params.get('value'))
                attr = filter_type
                for obs in observations:
                    obs_value = _int(obs, attr, -1)
                    if obs_value == value:
                        matching_obs.append(obs)
        
        # Apply action (keep or delete) and calculate counts
        if is_cloud_mode() and sql_filters and action == 'delete':
            total_count = obs_db.count()
            all_observations = obs_db.load_all()
            matching_set = {id(o) for o in matching_obs}
            filtered_obs = [obs for obs in all_observations if id(obs) not in matching_set]
            kept_count = len(filtered_obs)
            deleted_count = total_count - kept_count
        elif action == 'keep':
            filtered_obs = matching_obs
            if is_cloud_mode() and sql_filters:
                kept_count = len(filtered_obs)
                deleted_count = obs_db.count() - kept_count
            else:
                kept_count = len(filtered_obs)
                deleted_count = len(all_obs) - kept_count
        else:  # action == 'delete' (Local-Mode or Python-filtered)
            matching_set = {id(o) for o in matching_obs}
            filtered_obs = [obs for obs in all_obs if id(obs) not in matching_set]
            kept_count = len(filtered_obs)
            deleted_count = len(all_obs) - kept_count
        
        # Apply filtered result directly in backend storage
        if is_cloud_mode():
            # Cloud Mode: Replace all observations in database
            obs_db.delete_all()
            for obs in filtered_obs:
                obs_db.insert(obs)
        else:
            # Local Mode: Replace in-memory observations
            current_app.config['OBSERVATIONS'] = filtered_obs
            # Only mark dirty if observations were actually removed
            if deleted_count > 0:
                current_app.config['DIRTY'] = True
        
        return jsonify({
            'success': True,
            'kept_count': kept_count,
            'deleted_count': deleted_count
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/photos', methods=['GET'])
def list_observation_photos() -> Dict[str, Any]:
    """List observation photos from S3 for a single day and observer."""
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    debug_mode = str(request.args.get('debug', '0')).lower() in ('1', 'true', 'yes')

    kk = _int(request.args, 'kk', -1)
    jj = _int(request.args, 'jj', -1)
    mm = _int(request.args, 'mm', -1)
    tt = _int(request.args, 'tt', -1)

    if kk < 0 or jj < 0 or mm < 0 or tt < 0:
        return jsonify({'error': 'missing_parameters'}), 400

    auth_error = _check_cloud_photo_read_auth(kk)
    if auth_error:
        return auth_error

    try:
        s3 = _get_s3_client()
        prefix = _observation_photo_prefix(jj, mm, tt, kk)

        response = s3.list_objects_v2(Bucket=PHOTO_BUCKET_NAME, Prefix=prefix)
        contents = response.get('Contents', [])

        object_keys = {
            item.get('Key', '')
            for item in contents
            if item.get('Key', '')
        }

        original_keys = [
            key for key in object_keys
            if not key.endswith('/')
            and key.lower().endswith(PHOTO_ALLOWED_EXTENSIONS)
            and not _is_thumbnail_key(key)
        ]

        photos = []
        thumbnail_debug = []
        for key in sorted(original_keys, key=lambda p: p.split('/')[-1].lower()):
            thumb_key = _thumbnail_key_for_photo(key)
            thumb_status = 'existing'
            thumb_error = None
            if thumb_key not in object_keys:
                try:
                    source_obj = s3.get_object(Bucket=PHOTO_BUCKET_NAME, Key=key)
                    source_bytes = source_obj['Body'].read()
                    thumb_bytes, thumb_content_type = _generate_thumbnail_bytes(source_bytes, key)
                    s3.put_object(
                        Bucket=PHOTO_BUCKET_NAME,
                        Key=thumb_key,
                        Body=thumb_bytes,
                        ContentType=thumb_content_type,
                    )
                    object_keys.add(thumb_key)
                    thumb_status = 'created'
                except Exception as e:
                    thumb_status = 'fallback_original'
                    thumb_error = f"{type(e).__name__}: {str(e)}"
                    current_app.logger.exception(
                        "Thumbnail generation/upload failed for key=%s thumb_key=%s",
                        key,
                        thumb_key,
                    )
                    thumb_key = key

            if debug_mode:
                thumbnail_debug.append({
                    'key': key,
                    'thumb_key': thumb_key,
                    'status': thumb_status,
                    'error': thumb_error,
                })

            thumb_url = f"/api/observations/photos/file?key={quote(thumb_key, safe='')}"
            full_url = f"/api/observations/photos/file?key={quote(key, safe='')}"
            photos.append({
                'key': key,
                'thumb_key': thumb_key,
                'name': key.split('/')[-1],
                'url': thumb_url,
                'full_url': full_url,
            })

        photos.sort(key=lambda p: p['name'].lower())
        result = {'photos': photos}
        if debug_mode:
            result['thumbnail_debug'] = thumbnail_debug
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/photos/delete', methods=['POST'])
def delete_observation_photo() -> Dict[str, Any]:
    """Delete one observation photo from S3."""
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    data = request.get_json() or {}
    key = data.get('key', '')
    kk = _int(data, 'kk', -1)
    jj = _int(data, 'jj', -1)
    mm = _int(data, 'mm', -1)
    tt = _int(data, 'tt', -1)

    if not key or kk < 0 or jj < 0 or mm < 0 or tt < 0:
        return jsonify({'error': 'missing_parameters'}), 400

    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error

    required_prefix = _observation_photo_prefix(jj, mm, tt, kk)
    if not key.startswith(required_prefix):
        return jsonify({'error': 'invalid_photo_key'}), 400

    try:
        s3 = _get_s3_client()
        s3.delete_object(Bucket=PHOTO_BUCKET_NAME, Key=key)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/photos/file', methods=['GET'])
def get_observation_photo_file() -> Response:
    """Proxy a single observation photo from S3 to the browser (cloud mode only)."""
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    key = request.args.get('key', '')
    if not key or key.endswith('/'):
        return jsonify({'error': 'missing_parameters'}), 400

    kk = _extract_kk_from_photo_key(key)
    if kk is None:
        return jsonify({'error': 'invalid_photo_key'}), 400

    auth_error = _check_cloud_photo_read_auth(kk)
    if auth_error:
        return auth_error

    try:
        s3 = _get_s3_client()
        obj = s3.get_object(Bucket=PHOTO_BUCKET_NAME, Key=key)
        content = obj['Body'].read()
        content_type = obj.get('ContentType') or mimetypes.guess_type(key)[0] or 'application/octet-stream'
        return Response(content, mimetype=content_type)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/photos/add', methods=['POST'])
def add_observation_photos() -> Dict[str, Any]:
    """Upload one or more observation photos to S3 (cloud mode only)."""
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    kk = _int(request.form, 'kk', -1)
    jj = _int(request.form, 'jj', -1)
    mm = _int(request.form, 'mm', -1)
    tt = _int(request.form, 'tt', -1)

    if kk < 0 or jj < 0 or mm < 0 or tt < 0:
        return jsonify({'error': 'missing_parameters'}), 400

    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error

    files = request.files.getlist('photos')
    files = [f for f in files if f and f.filename]
    if not files:
        return jsonify({'error': 'missing_files'}), 400

    if len(files) > PHOTO_MAX_FILES_PER_OBSERVATION:
        return jsonify({'error': 'too_many_files'}), 400

    prefix = _observation_photo_prefix(jj, mm, tt, kk)

    try:
        s3 = _get_s3_client()

        # Count existing original photos (exclude generated thumbnails)
        existing_response = s3.list_objects_v2(Bucket=PHOTO_BUCKET_NAME, Prefix=prefix)
        existing_contents = existing_response.get('Contents', [])
        existing_original_count = sum(
            1
            for item in existing_contents
            if item.get('Key', '').lower().endswith(PHOTO_ALLOWED_EXTENSIONS)
            and not _is_thumbnail_key(item.get('Key', ''))
        )

        if existing_original_count + len(files) > PHOTO_MAX_FILES_PER_OBSERVATION:
            return jsonify({'error': 'too_many_files'}), 400

        uploaded = []
        for file_storage in files:
            original_name = file_storage.filename or ''
            ext = os.path.splitext(original_name)[1].lower()
            if ext not in PHOTO_ALLOWED_EXTENSIONS:
                return jsonify({'error': 'invalid_file_type', 'filename': original_name}), 400

            file_bytes = file_storage.read()
            if len(file_bytes) > PHOTO_MAX_FILE_SIZE_BYTES:
                return jsonify({'error': 'file_too_large', 'filename': original_name}), 400

            # Keep user-provided filename but sanitize path separators.
            safe_name = os.path.basename(original_name).replace('\\', '_').replace('/', '_')
            object_key = f"{prefix}/{safe_name}"
            content_type = file_storage.mimetype or mimetypes.guess_type(safe_name)[0] or 'application/octet-stream'

            s3.put_object(
                Bucket=PHOTO_BUCKET_NAME,
                Key=object_key,
                Body=file_bytes,
                ContentType=content_type,
            )

            # Try to pre-generate thumbnail immediately for faster gallery load.
            try:
                thumb_key = _thumbnail_key_for_photo(object_key)
                thumb_bytes, thumb_content_type = _generate_thumbnail_bytes(file_bytes, object_key)
                s3.put_object(
                    Bucket=PHOTO_BUCKET_NAME,
                    Key=thumb_key,
                    Body=thumb_bytes,
                    ContentType=thumb_content_type,
                )
            except Exception:
                current_app.logger.exception("Thumbnail pre-generation failed for uploaded key=%s", object_key)

            uploaded.append({'key': object_key, 'name': safe_name})

        return jsonify({'success': True, 'uploaded': uploaded, 'count': len(uploaded)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
