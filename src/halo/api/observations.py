"""Observation CRUD API endpoints.

Routes: /observations (GET/POST), /observations/search, /observations/delete,
        /observations/replace, /observations/save, /observations/filter

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

from typing import Dict, Any

from flask import jsonify, request, current_app, session

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.models.constants import DEFAULT_OBSERVATION_LIMIT
import halo.io.observations as obs_logic
import halo.io.observations_file as obs_file
import halo.io.observations_db as obs_db
from ._helpers import _check_cloud_write_auth, _int, _obs_to_json, _spaeter


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
        
        # Fixed observer filter (per-user session)
        fixed_observer = session.get('observer_kk')
        if fixed_observer:
            filters['kk'] = int(fixed_observer)
        
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
