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
    jj_to_full_year,
)
import halo.io.observations as obs_logic
import halo.io.observations_file as obs_file
import halo.io.observations_db as obs_db
import halo.io.observers_db as observers_db
from ._helpers import _check_cloud_write_auth, _int, _obs_to_json, _spaeter
from .analysis import _calculate_observation_solar_altitude


PHOTO_BUCKET_NAME = os.getenv('HALOPY_PHOTO_BUCKET', 'halophotos')
PHOTO_CAPTION_FILENAME = 'caption.txt'


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


def _caption_key_for_prefix(prefix: str) -> str:
    """Return caption text key for an observation photo folder."""
    return f"{prefix}/{PHOTO_CAPTION_FILENAME}"


def _is_original_photo_key(key: str) -> bool:
    """Return True when key is a non-thumbnail original image file."""
    return (
        bool(key)
        and not key.endswith('/')
        and key.lower().endswith(PHOTO_ALLOWED_EXTENSIONS)
        and not _is_thumbnail_key(key)
    )


def _is_thumbnail_key(key: str) -> bool:
    """Return True when object key uses *_tn.<ext> naming."""
    filename = key.rsplit('/', 1)[-1]
    stem, _ = os.path.splitext(filename)
    return stem.lower().endswith('_tn')


def _read_photo_caption_text(s3, prefix: str) -> str:
    """Return caption text for a photo folder or empty string when missing."""
    caption_key = _caption_key_for_prefix(prefix)
    try:
        obj = s3.get_object(Bucket=PHOTO_BUCKET_NAME, Key=caption_key)
    except Exception as e:
        error_code = getattr(e, 'response', {}).get('Error', {}).get('Code')
        if error_code in ('NoSuchKey', '404'):
            return ''
        raise

    body = obj.get('Body')
    if not body:
        return ''
    return body.read().decode('utf-8')


def _write_photo_caption_text(s3, prefix: str, caption: str):
    """Store caption.txt for a photo folder, or delete it when empty."""
    caption_key = _caption_key_for_prefix(prefix)
    normalized_caption = (caption or '').replace('\r\n', '\n').replace('\r', '\n')

    if not normalized_caption.strip():
        s3.delete_object(Bucket=PHOTO_BUCKET_NAME, Key=caption_key)
        return

    s3.put_object(
        Bucket=PHOTO_BUCKET_NAME,
        Key=caption_key,
        Body=normalized_caption.encode('utf-8'),
        ContentType='text/plain; charset=utf-8',
    )


def _list_prefix_object_keys(s3, prefix: str):
    """Return all object keys below a prefix."""
    continuation_token = None
    keys = []

    while True:
        kwargs = {'Bucket': PHOTO_BUCKET_NAME, 'Prefix': prefix, 'MaxKeys': 1000}
        if continuation_token:
            kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**kwargs)
        keys.extend(item.get('Key') for item in response.get('Contents', []) if item.get('Key'))

        if not response.get('IsTruncated'):
            return keys
        continuation_token = response.get('NextContinuationToken')


def _has_original_photos(s3, prefix: str) -> bool:
    """Return True when a prefix still contains at least one original photo."""
    return any(_is_original_photo_key(key) for key in _list_prefix_object_keys(s3, prefix))


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


def _normalized_year(value: Any) -> int:
    """Normalize year value to 4-digit format for day-level comparisons."""
    try:
        return jj_to_full_year(int(value))
    except (TypeError, ValueError):
        return -1


def _day_values_from_obs(obs: Dict[str, Any]):
    """Extract (kk, jj_full, mm, tt) from an observation-like dict."""
    try:
        kk = int(obs.get('KK'))
        jj = _normalized_year(obs.get('JJ'))
        mm = int(obs.get('MM'))
        tt = int(obs.get('TT'))
    except (TypeError, ValueError):
        return None

    if kk < 0 or jj < 0 or mm < 1 or mm > 12 or tt < 1 or tt > 31:
        return None

    return kk, jj, mm, tt


def _same_observation_day(obs: Dict[str, Any], kk: int, jj: int, mm: int, tt: int) -> bool:
    """Return True when observation is for the same observer/day."""
    day = _day_values_from_obs(obs)
    if not day:
        return False
    return day == (kk, jj, mm, tt)


def _prefix_has_payload_objects(s3, prefix: str) -> bool:
    """Return True if prefix contains objects other than optional folder markers."""
    continuation_token = None
    marker_keys = {prefix, f"{prefix}/"}

    while True:
        kwargs = {'Bucket': PHOTO_BUCKET_NAME, 'Prefix': prefix, 'MaxKeys': 1000}
        if continuation_token:
            kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**kwargs)
        for item in response.get('Contents', []):
            key = item.get('Key')
            if key and key not in marker_keys:
                return True

        if not response.get('IsTruncated'):
            return False
        continuation_token = response.get('NextContinuationToken')


def _delete_prefix_markers(s3, prefix: str):
    """Delete folder marker keys for a prefix (idempotent)."""
    s3.delete_objects(
        Bucket=PHOTO_BUCKET_NAME,
        Delete={'Objects': [{'Key': prefix}, {'Key': f"{prefix}/"}]},
    )


def _cleanup_empty_parent_prefixes(s3, jj: int, mm: int, tt: int):
    """Remove empty day/month/year markers after kk-prefix deletion."""
    day_prefix = f"{jj:04d}/{mm:02d}/{tt:02d}"
    month_prefix = f"{jj:04d}/{mm:02d}"
    year_prefix = f"{jj:04d}"

    for prefix in [day_prefix, month_prefix, year_prefix]:
        if _prefix_has_payload_objects(s3, prefix):
            break
        _delete_prefix_markers(s3, prefix)


def _cleanup_empty_photo_prefix(s3, jj: int, mm: int, tt: int, kk: int):
    """Remove empty kk-prefix marker and then clean up empty parent prefixes."""
    prefix = _observation_photo_prefix(jj, mm, tt, kk)
    if _prefix_has_payload_objects(s3, prefix):
        return

    _delete_prefix_markers(s3, prefix)
    _cleanup_empty_parent_prefixes(s3, jj, mm, tt)


def _delete_photo_prefix(jj: int, mm: int, tt: int, kk: int) -> int:
    """Delete all photo objects under YYYY/MM/DD/kkXX and return deleted count."""
    s3 = _get_s3_client()
    prefix = _observation_photo_prefix(jj, mm, tt, kk)
    continuation_token = None
    deleted_count = 0

    while True:
        kwargs = {'Bucket': PHOTO_BUCKET_NAME, 'Prefix': prefix}
        if continuation_token:
            kwargs['ContinuationToken'] = continuation_token

        response = s3.list_objects_v2(**kwargs)
        keys = [item.get('Key') for item in response.get('Contents', []) if item.get('Key')]

        for i in range(0, len(keys), 1000):
            batch = keys[i:i + 1000]
            if not batch:
                continue
            s3.delete_objects(
                Bucket=PHOTO_BUCKET_NAME,
                Delete={'Objects': [{'Key': key} for key in batch]},
            )
            deleted_count += len(batch)

        if not response.get('IsTruncated'):
            break
        continuation_token = response.get('NextContinuationToken')

    _cleanup_empty_parent_prefixes(s3, jj, mm, tt)

    return deleted_count


def _move_photo_prefix(s3, from_prefix: str, to_prefix: str) -> int:
    """Copy all objects from from_prefix to to_prefix, delete originals, then clean up.

    Moves photos, thumbnails, caption.txt — everything under the prefix.
    Returns the number of objects moved.
    """
    all_keys = _list_prefix_object_keys(s3, from_prefix)
    if not all_keys:
        return 0

    for key in all_keys:
        suffix = key[len(from_prefix):]   # e.g. '/photo.jpg'
        dest_key = f"{to_prefix}{suffix}"
        s3.copy_object(
            Bucket=PHOTO_BUCKET_NAME,
            CopySource={'Bucket': PHOTO_BUCKET_NAME, 'Key': key},
            Key=dest_key,
        )

    # Batch-delete source objects
    for i in range(0, len(all_keys), 1000):
        batch = all_keys[i:i + 1000]
        s3.delete_objects(
            Bucket=PHOTO_BUCKET_NAME,
            Delete={'Objects': [{'Key': k} for k in batch]},
        )

    # Clean up now-empty source prefix
    parts = from_prefix.rstrip('/').split('/')
    if len(parts) >= 4:
        try:
            from_jj = int(parts[0])
            from_mm = int(parts[1])
            from_tt = int(parts[2])
            _delete_prefix_markers(s3, from_prefix)
            _cleanup_empty_parent_prefixes(s3, from_jj, from_mm, from_tt)
        except (ValueError, IndexError):
            pass

    return len(all_keys)


def _delete_photo_policy(data: Dict[str, Any]):
    """Return delete policy for photos when deleting one observation."""
    day_values = _day_values_from_obs(data)
    if not day_values:
        return {'target_exists': False, 'remaining_same_day': 0, 'force_delete_photos': False}

    kk, jj_full, mm, tt = day_values

    if is_cloud_mode():
        day_observations = obs_db.load_filtered(kk=kk, jj=jj_full, mm=mm, tt=tt)
    else:
        day_observations = [
            obs for obs in (current_app.config.get('OBSERVATIONS') or [])
            if _same_observation_day(obs, kk, jj_full, mm, tt)
        ]

    target_key = obs_logic.make_observation_key(data)
    target_exists = any(obs_logic.make_observation_key(obs) == target_key for obs in day_observations)
    remaining_same_day = max(len(day_observations) - (1 if target_exists else 0), 0)

    has_photos = False
    if is_cloud_mode() and target_exists:
        try:
            s3 = _get_s3_client()
            prefix = _observation_photo_prefix(jj_full, mm, tt, kk)
            resp = s3.list_objects_v2(Bucket=PHOTO_BUCKET_NAME, Prefix=prefix, MaxKeys=10)
            has_photos = any(
                _is_original_photo_key(obj['Key'])
                for obj in resp.get('Contents', [])
            )
        except Exception:
            pass

    return {
        'target_exists': target_exists,
        'remaining_same_day': remaining_same_day,
        'force_delete_photos': target_exists and remaining_same_day == 0,
        'has_photos': has_photos,
    }


@api_blueprint.route('/observations/delete/photo-policy', methods=['POST'])
def get_delete_photo_policy() -> Dict[str, Any]:
    """Return whether photo deletion must be forced for this observation delete."""
    data = request.get_json() or {}

    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(data.get('KK'))
    if auth_error:
        return auth_error

    try:
        policy = _delete_photo_policy(data)
        return jsonify(policy)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


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
        delete_photos_requested = bool(data.get('delete_photos', False))
        policy = _delete_photo_policy(data)
        delete_photos = delete_photos_requested or policy.get('force_delete_photos', False)
        photo_delete_count = 0

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

            if success and delete_photos:
                day_values = _day_values_from_obs(data)
                if day_values:
                    kk, jj_full, mm, tt = day_values
                    photo_delete_count = _delete_photo_prefix(jj_full, mm, tt, kk)
            
            # Get count directly from database (no caching)
            count = obs_db.count()
            return jsonify({
                'success': True,
                'deleted': success,
                'count': count,
                'photos_deleted': photo_delete_count,
                'delete_photos': bool(success and delete_photos),
                'force_delete_photos': bool(policy.get('force_delete_photos', False)),
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
                return jsonify({
                    'success': True,
                    'deleted': True,
                    'count': len(observations),
                    'photos_deleted': 0,
                    'delete_photos': False,
                    'force_delete_photos': bool(policy.get('force_delete_photos', False)),
                })
            else:
                return jsonify({
                    'success': False,
                    'deleted': False,
                    'count': len(observations),
                    'photos_deleted': 0,
                    'delete_photos': False,
                    'force_delete_photos': bool(policy.get('force_delete_photos', False)),
                })
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
            if _is_original_photo_key(key)
        ]

        caption = _read_photo_caption_text(s3, prefix)

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
        result = {'photos': photos, 'caption': caption}
        if debug_mode:
            result['thumbnail_debug'] = thumbnail_debug
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/photos/caption', methods=['PUT'])
def save_observation_photo_caption() -> Dict[str, Any]:
    """Create, update, or remove caption.txt for an observation photo folder."""
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    data = request.get_json() or {}
    kk = _int(data, 'kk', -1)
    jj = _int(data, 'jj', -1)
    mm = _int(data, 'mm', -1)
    tt = _int(data, 'tt', -1)
    caption = data.get('caption', '')

    if kk < 0 or jj < 0 or mm < 0 or tt < 0:
        return jsonify({'error': 'missing_parameters'}), 400

    if not isinstance(caption, str):
        return jsonify({'error': 'invalid_caption'}), 400

    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error

    prefix = _observation_photo_prefix(jj, mm, tt, kk)

    try:
        s3 = _get_s3_client()
        has_photos = _has_original_photos(s3, prefix)
        if not has_photos and caption.strip():
            return jsonify({'error': 'no_photos'}), 400

        _write_photo_caption_text(s3, prefix, caption)
        if not has_photos:
            _cleanup_empty_photo_prefix(s3, jj, mm, tt, kk)
        return jsonify({'success': True, 'caption': caption if has_photos else ''})
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
        prefix = _observation_photo_prefix(jj, mm, tt, kk)
        keys_to_delete = [key]
        if not _is_thumbnail_key(key):
            thumb_key = _thumbnail_key_for_photo(key)
            if thumb_key != key:
                keys_to_delete.append(thumb_key)

        # Batch delete is idempotent and succeeds even if some keys do not exist.
        s3.delete_objects(
            Bucket=PHOTO_BUCKET_NAME,
            Delete={'Objects': [{'Key': k} for k in keys_to_delete]},
        )

        caption_deleted = False
        if not _has_original_photos(s3, prefix):
            s3.delete_object(Bucket=PHOTO_BUCKET_NAME, Key=_caption_key_for_prefix(prefix))
            caption_deleted = True
            _cleanup_empty_photo_prefix(s3, jj, mm, tt, kk)

        return jsonify({
            'success': True,
            'deleted_keys': keys_to_delete,
            'caption_deleted': caption_deleted,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/photos/move-prefix', methods=['POST'])
def move_observation_photo_prefix() -> Dict[str, Any]:
    """Move all photos from one S3 prefix to another (cloud mode only).

    Used when an observation's date or observer (KK) changes, so photos,
    thumbnails and caption.txt follow the observation to its new S3 location.

    Request body:
        { "from_prefix": "2026/03/08/kk44", "to_prefix": "2026/03/09/kk44" }

    Response:
        { "moved": <number of objects moved> }
    """
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    if not session.get('authenticated', False):
        return jsonify({'error': 'not_authenticated'}), 401

    data = request.get_json() or {}
    from_prefix = (data.get('from_prefix') or '').strip().strip('/')
    to_prefix = (data.get('to_prefix') or '').strip().strip('/')

    if not from_prefix or not to_prefix:
        return jsonify({'error': 'missing_parameters'}), 400

    if from_prefix == to_prefix:
        return jsonify({'moved': 0})

    # Both prefixes must be in YYYY/MM/DD/kkXX format.
    def _kk_from_prefix(p: str):
        parts = p.split('/')
        if len(parts) < 4:
            return -1
        kk_str = parts[3].lower()
        if not kk_str.startswith('kk') or len(kk_str) < 4:
            return -1
        try:
            return int(kk_str[2:4])
        except ValueError:
            return -1

    to_kk = _kk_from_prefix(to_prefix)
    from_kk = _kk_from_prefix(from_prefix)

    if to_kk < 0 or from_kk < 0:
        return jsonify({'error': 'invalid_prefix'}), 400

    # Auth: user must own the destination KK (or be admin).
    auth_error = _check_cloud_write_auth(to_kk)
    if auth_error:
        return auth_error

    try:
        s3 = _get_s3_client()
        moved = _move_photo_prefix(s3, from_prefix, to_prefix)
        return jsonify({'moved': moved})
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


@api_blueprint.route('/observations/photos/monthly-captions', methods=['GET'])
def list_monthly_photo_captions() -> Dict[str, Any]:
    """List photo folders with captions for a given year/month (admin only).

    Intended for HALOassist monthly report generation. Returns only folders
    where caption.txt exists with non-empty content, enriched with observer
    metadata and observation area (GG) from the database.

    Query parameters:
        jj: 4-digit year
        mm: month (1-12)

    Response:
        {
            "jj": 2025, "mm": 1, "count": 2,
            "entries": [
                {
                    "jj": 2025, "mm": 1, "tt": 15, "kk": 44,
                    "observer_name": "Max Mustermann",
                    "observer_hbort": "Seysdorf",
                    "gg": 5,
                    "caption": "Großer 22°-Ring ...",
                    "photo_count": 3,
                    "photos": [
                        {"key": "...", "name": "img1.jpg",
                         "url": "/api/observations/photos/file?key=..."}
                    ]
                }
            ]
        }
    """
    if not is_cloud_mode():
        return jsonify({'error': 'cloud_mode_only'}), 403

    if not session.get('authenticated', False):
        return jsonify({'error': 'not_authenticated'}), 401

    if not session.get('is_admin', False):
        return jsonify({'error': 'admin_required'}), 403

    jj = _int(request.args, 'jj', -1)
    mm = _int(request.args, 'mm', -1)

    if jj < 1 or mm < 1 or mm > 12:
        return jsonify({'error': 'missing_parameters'}), 400

    try:
        s3 = _get_s3_client()
        month_prefix = f"{jj:04d}/{mm:02d}/"

        all_keys = _list_prefix_object_keys(s3, month_prefix)

        # Group all keys by YYYY/MM/DD/kkXX folder (first 4 path segments).
        folder_keys: dict = {}
        for key in all_keys:
            parts = key.split('/')
            if len(parts) >= 4:
                folder = '/'.join(parts[:4])
                folder_keys.setdefault(folder, []).append(key)

        # Collect unique KK values from folders that have a caption key present.
        unique_kks: set = set()
        for folder, keys in folder_keys.items():
            if f"{folder}/{PHOTO_CAPTION_FILENAME}" in set(keys):
                parts = folder.split('/')
                if len(parts) >= 4:
                    kk_part = parts[3].lower()
                    if kk_part.startswith('kk') and len(kk_part) >= 4:
                        try:
                            unique_kks.add(int(kk_part[2:4]))
                        except ValueError:
                            pass

        # Load and cache observer info for each unique KK in this month.
        obs_year_full = jj_to_full_year(jj)
        month_year_comparable = obs_year_full * 100 + mm
        observer_info: dict = {}  # kk -> {'name': str, 'hbort': str}

        for kk_val in unique_kks:
            candidates = []
            for rec in observers_db.load_filtered(kk=kk_val):
                try:
                    seit_str = rec.get('seit', '')
                    seit_mm_str, seit_yy_str = seit_str.split('/')
                    seit_year_full = jj_to_full_year(int(seit_yy_str))
                    rec_comparable = seit_year_full * 100 + int(seit_mm_str)
                    if rec_comparable <= month_year_comparable:
                        candidates.append((rec_comparable, rec))
                except (ValueError, AttributeError, IndexError):
                    pass
            if candidates:
                candidates.sort(key=lambda x: x[0], reverse=True)
                best = candidates[0][1]
                vname = best.get('VName', '')
                nname = best.get('NName', '')
                observer_info[kk_val] = {
                    'name': f"{vname} {nname}".strip(),
                    'hbort': best.get('HbOrt', ''),
                }

        # Build entries for folders that have a non-empty caption.
        entries = []
        for folder, keys in sorted(folder_keys.items()):
            key_set = set(keys)
            caption_key = f"{folder}/{PHOTO_CAPTION_FILENAME}"
            if caption_key not in key_set:
                continue

            caption = _read_photo_caption_text(s3, folder)
            if not caption.strip():
                continue

            # Parse folder segments: YYYY/MM/DD/kkXX
            parts = folder.split('/')
            try:
                folder_jj = int(parts[0])
                folder_mm = int(parts[1])
                folder_tt = int(parts[2])
                kk_str = parts[3].lower()
                folder_kk = int(kk_str[2:4]) if kk_str.startswith('kk') else -1
            except (ValueError, IndexError):
                continue

            # Observer metadata from cache.
            info = observer_info.get(folder_kk, {})
            observer_name = info.get('name', '')
            observer_hbort = info.get('hbort', '')

            # Resolve GG from observation records for this day/observer.
            # Return the value only when all observations agree on a single GG.
            gg: Any = None
            try:
                day_obs = obs_db.load_filtered(kk=folder_kk, jj=folder_jj, mm=folder_mm, tt=folder_tt)
                gg_values = {
                    int(o.get('GG', 0) or 0)
                    for o in day_obs
                    if o.get('GG') not in (None, '', '0', 0)
                }
                if len(gg_values) == 1:
                    gg = next(iter(gg_values))
            except Exception:
                pass

            # Original photos (no thumbnails).
            original_keys = sorted(
                [k for k in keys if _is_original_photo_key(k)],
                key=lambda p: p.split('/')[-1].lower(),
            )
            photos = [
                {
                    'key': k,
                    'name': k.split('/')[-1],
                    'url': f"/api/observations/photos/file?key={quote(k, safe='')}",
                }
                for k in original_keys
            ]

            entries.append({
                'jj': folder_jj,
                'mm': folder_mm,
                'tt': folder_tt,
                'kk': folder_kk,
                'observer_name': observer_name,
                'observer_hbort': observer_hbort,
                'gg': gg,
                'caption': caption,
                'photo_count': len(photos),
                'photos': photos,
            })

        return jsonify({
            'jj': jj,
            'mm': mm,
            'count': len(entries),
            'entries': entries,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
