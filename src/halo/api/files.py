"""File management API endpoints.

Routes: /files, /file/new, /file/list, /file/read-startup, /file/load,
        /file/merge, /file/save, /file/upload, /file/download,
        /file/status, /file/autosave, /file/check_autosave,
        /file/restore_autosave, /file/cleanup_autosave

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

import io
import os
import shutil
import tempfile
from functools import cmp_to_key
from io import StringIO
from pathlib import Path
from typing import Dict, Any

from flask import jsonify, request, current_app, session, send_file

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.io.csv_handler import ObservationCSV
from halo.services.auth import AuthService
from halo.web.extensions import csrf
import halo.io.observations as obs_logic
import halo.io.observations_file as obs_file
import halo.io.observations_db as obs_db
from ._helpers import _spaeter


@api_blueprint.route('/files', methods=['GET'])
def list_files() -> Dict[str, Any]:
    """List available .HAL and .CSV files in data directory"""
    datapath = obs_file.get_data_path()
    if not datapath.exists():
        return jsonify({'error': 'data_directory_not_found'}), 404
    
    try:
        files = []
        for filename in os.listdir(str(datapath)):
            if filename.endswith('.HAL') or filename.endswith('.CSV') or filename.endswith('.hal') or filename.endswith('.csv'):
                filepath = os.path.join(str(datapath), filename)
                stat = os.stat(filepath)
                files.append({
                    'name': filename,
                    'size': stat.st_size,
                    'modified': stat.st_mtime
                })
        
        files.sort(key=lambda x: x['name'])
        return jsonify({'files': files, 'directory': str(datapath)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/new', methods=['POST'])
def new_file() -> Dict[str, Any]:
    """Create new empty file - implements 'Datei -> neue Datei'"""
    data = request.get_json()
    filename = data.get('filename', '')
    
    if not filename:
        return jsonify({'error': 'filename_required'}), 400
    
    # Ensure .csv extension
    if not filename.lower().endswith('.csv'):
        filename += '.csv'
    
    filepath = obs_file.get_data_path(filename)
    
    if filepath.exists():
        return jsonify({'error': 'file_already_exists'}), 400
    
    try:
        obs_file.new_file(filename)
        
        current_app.config['LOADED_FILE'] = filename
        current_app.config['OBSERVATIONS'] = []
        current_app.config['DIRTY'] = False
        
        return jsonify({
            'success': True,
            'filename': filename
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/list', methods=['GET'])
def list_data_files():
    """List all CSV files in the data/ folder for startup file selection."""
    # Only in Local Mode
    if is_cloud_mode():
        return jsonify({'error': 'file_list_cloud_mode_not_supported'}), 403
    
    try:
        root_path = Path(__file__).parent.parent.parent.parent
        data_path = root_path / 'data'
        
        if not data_path.exists():
            return jsonify({'files': []})
        
        # Get all CSV files
        files = [f.name for f in data_path.glob('*.csv')]
        files.sort()
        
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/read-startup', methods=['GET'])
def read_startup_file():
    """Read the configured startup file and return its CSV content."""
    # Only in Local Mode
    if is_cloud_mode():
        return jsonify({'error': 'startup_file_cloud_mode_not_supported'}), 403
    
    startup_file_path = current_app.config.get('STARTUP_FILE_PATH', '')
    if not startup_file_path:
        return jsonify({'error': 'no_startup_file_configured'}), 404
    
    try:
        # Always look in data/ folder
        root_path = Path(__file__).parent.parent.parent.parent
        file_path = root_path / 'data' / startup_file_path
        
        if not file_path.exists():
            return jsonify({'error': 'startup_file_not_found', 'path': str(file_path)}), 404
        
        # Read CSV file as text
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/load', methods=['POST'])
def load_file_from_browser() -> Dict[str, Any]:
    """Load a file from user's filesystem directly into memory."""
    if 'file' not in request.files:
        return jsonify({'error': 'no_file_provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'no_file_selected'}), 400
    
    if not file.filename.lower().endswith('.csv'):
        return jsonify({'error': 'only_csv_supported'}), 400
    
    try:
        # Save uploaded file temporarily to detect legacy format
        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as tmp:
            file.save(tmp.name)
            temp_path = Path(tmp.name)
        
        try:
            temp_filename = f"upload_{file.filename}"
            shutil.copy(temp_path, obs_file.get_data_path(temp_filename))
            observations, _, needs_conversion = obs_file.open_file(temp_filename)
            obs_file.delete_file(temp_filename)  # Clean up after loading
            
            # Store in app config
            current_app.config['LOADED_FILE'] = file.filename
            current_app.config['OBSERVATIONS'] = observations
            current_app.config['DIRTY'] = needs_conversion  # Legacy conversion needs saving
            
            return jsonify({
                'success': True,
                'filename': file.filename,
                'count': len(observations),
                'message': f'{len(observations)} Beobachtungen geladen!',
                'converted': needs_conversion
            })
        finally:
            # Clean up temp file
            if temp_path.exists():
                os.unlink(temp_path)
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/merge', methods=['POST'])
def merge_file() -> Dict[str, Any]:
    """Merge observations from uploaded file with currently loaded file - implements 'Datei -> Verbinden'."""
    
    # Check if a file is already loaded
    if not current_app.config.get('LOADED_FILE'):
        return jsonify({'error': 'no_file_loaded'}), 400
    
    if 'file' not in request.files:
        return jsonify({'error': 'no_file_provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'no_file_selected'}), 400
    
    if not file.filename.lower().endswith('.csv'):
        return jsonify({'error': 'only_csv_supported'}), 400
    
    try:
        # Read file content directly into memory (HALO CSV is latin-1)
        content = file.read().decode('latin-1')
        file_object = StringIO(content)
        
        # Parse CSV directly from memory
        new_observations = obs_file.import_observations_from_csv(file_object)
        
        # Get currently loaded observations
        current_observations = current_app.config.get('OBSERVATIONS', [])
        
        # Deduplicate using make_observation_key() - the single source of truth
        existing_keys = set()
        for obs in current_observations:
            existing_keys.add(obs_logic.make_observation_key(obs))
        
        # Add observations from new file that don't already exist
        added_count = 0
        skipped_count = 0
        for obs in new_observations:
            key = obs_logic.make_observation_key(obs)
            if key not in existing_keys:
                current_observations.append(obs)
                existing_keys.add(key)
                added_count += 1
            else:
                skipped_count += 1
        
        # Sort observations using spaeter() equivalent
        current_observations = sorted(current_observations, key=cmp_to_key(_spaeter))
        
        # Update app config
        current_app.config['OBSERVATIONS'] = current_observations
        # Mark as dirty only if at least one observation was added
        if added_count > 0:
            current_app.config['DIRTY'] = True
        
        return jsonify({
            'success': True,
            'added_count': added_count,
            'skipped_count': skipped_count,
            'total_count': len(current_observations),
            'duplicate_count': skipped_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/load/<filename>', methods=['GET', 'POST'])
def load_file(filename: str) -> Dict[str, Any]:
    """Load observation file from data folder - implements 'Datei -> Laden' from HALO.PAS laden()
    
    Local Mode only: Loads CSV file into memory.
    Cloud Mode: Returns error - no file operations needed, data always in database.
    """
    try:
        if is_cloud_mode():
            # Cloud Mode: File operations not supported
            # Data is always available directly from database, no need to "load"
            return jsonify({
                'error': 'file_operations_not_supported_in_cloud_mode',
                'message': 'Cloud Mode uses database directly - no file loading needed'
            }), 400
        else:
            # Local Mode: Load from file
            filepath = obs_file.get_data_path(filename)
            
            if not filepath.exists():
                return jsonify({'error': 'File not found'}), 404
            
            observations, filepath, needs_conversion = obs_file.open_file(filename)
            
            # Store in app config
            current_app.config['LOADED_FILE'] = filename
            current_app.config['OBSERVATIONS'] = observations
            current_app.config['DIRTY'] = False
            
            # Auto-save in modern format if legacy file was converted
            if needs_conversion:
                obs_file.save_file(observations, filepath)
            
            return jsonify({
                'success': True,
                'filename': filename,
                'count': len(observations),
                'converted': needs_conversion
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/save', methods=['POST'])
def save_file() -> Dict[str, Any]:
    """Save current observations to disk.
    
    Local Mode only: Downloads CSV file to user's computer.
    Cloud Mode: Returns error - changes are automatically saved to database immediately.
    """
    if is_cloud_mode():
        # Cloud Mode: File operations not supported
        # All changes are saved immediately to database via POST/DELETE /observations
        # No separate "save" action needed
        return jsonify({
            'error': 'file_operations_not_supported_in_cloud_mode',
            'message': 'Cloud Mode saves changes immediately to database - no separate save needed'
        }), 400
    
    filename = current_app.config.get('LOADED_FILE')
    if not filename:
        return jsonify({'error': 'No file loaded'}), 400
    
    observations = current_app.config.get('OBSERVATIONS', [])
    
    try:
        # Local Mode: Save to file and download
        filepath = obs_file.get_data_path(filename)
        
        obs_file.save_file(observations, filepath)
        
        # Read file back for download
        with open(filepath, 'rb') as f:
            csv_bytes = f.read()
        csv_io = io.BytesIO(csv_bytes)
        csv_io.seek(0)
        
        current_app.config['DIRTY'] = False
        
        # Return file as download
        return send_file(
            csv_io,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/upload', methods=['POST'])
@csrf.exempt
def upload_file() -> Dict[str, Any]:
    """
    Upload observations - works in both Cloud and Local mode.
    
    Cloud Mode: Direct database operations (authenticated via session)
    Local Mode: Proxy to cloud server (send credentials + data)
    
    Request body:
        {
            "observerKK": "44",          # Local Mode only
            "password": "password",      # Local Mode only
            "observations": [...],
            "use_session": true/false,   # Cloud Mode: true, Local Mode: false
            "replace_mode": true/false   # true=Replace (default), false=Append
        }
    """
    
    data = request.get_json()
    observer_kk = data.get('observerKK')
    password = data.get('password', '')
    new_observations_data = data.get('observations', [])
    use_session = data.get('use_session', False)  # True in Cloud Mode
    replace_mode = data.get('replace_mode', True)  # Default: Replace mode
    
    # Authentication (both Cloud Mode with session and Local Mode with password)
    # Authenticate user
    is_admin = False
    authenticated_kk = None
    
    if use_session:
        # Cloud Mode with session (user already logged in)
        if not session.get('authenticated', False):
            return jsonify({'error': 'not_authenticated'}), 401
        
        is_admin = session.get('is_admin', False)
        authenticated_kk = session.get('observer_kk')  # None for admin
        
        # In Cloud Mode with session, use authenticated_kk as observer_kk
        # (ignore observerKK from request body)
        if not is_admin:
            observer_kk = authenticated_kk  # Regular user: use KK from session
        # Admin can upload for any KK, so use observerKK from request if provided
    else:
        # Cloud Mode with password (proxied from Local Mode)
        if not observer_kk:
            return jsonify({'error': 'observer_kk_required'}), 400
        
        if not password:
            return jsonify({'error': 'password_required'}), 400
        
        auth_service = AuthService()
        is_valid, user_kk = auth_service.verify_password(observer_kk, password)
        
        if not is_valid:
            return jsonify({'error': 'invalid_credentials'}), 401
        
        is_admin = (user_kk is None)  # None = admin
        authenticated_kk = user_kk
    
    if not new_observations_data:
        return jsonify({'error': 'no_observations_to_upload'}), 400
    
    try:
        # Convert observation dicts to Observation objects
        # SECURITY: Filter to only include observations matching authenticated user's KK
        # EXCEPTION: Admin can upload all observations
        new_observations = []
        filtered_out_count = 0
        
        for obs_dict in new_observations_data:
            # Admin can upload all, regular users only their own
            if not is_admin and str(obs_dict.get('KK')) != str(observer_kk):
                filtered_out_count += 1
                continue
            
            obs = {}
            for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
                val = obs_dict.get(field)
                obs[field] = str(val) if val is not None else ''
            obs['sectors'] = obs_dict.get('sectors', '') or ''
            obs['remarks'] = obs_dict.get('remarks', '') or ''
            new_observations.append(obs)
        
        if not new_observations:
            return jsonify({
                'error': 'no_valid_observations',
                'filtered_out': filtered_out_count
            }), 400
        
        # Database operations (Cloud Mode only - Local Mode exits early above)
        if replace_mode:
            # REPLACE MODE: Delete all existing observations of this observer first
            if is_admin:
                # Admin uploads: Delete ALL KKs present in upload, then insert
                kks_in_upload = set(obs.get('KK', '') for obs in new_observations)
                for kk in kks_in_upload:
                    obs_db.delete_all_for_observer(kk)
            else:
                # Regular user: Delete only their KK
                obs_db.delete_all_for_observer(str(observer_kk))
        # else: APPEND MODE - skip delete, just insert
        
        # Insert new observations into database
        added_count = 0
        duplicate_count = 0
        for obs in new_observations:
            success = obs_db.save_one(obs)
            if success:
                added_count += 1
            else:
                duplicate_count += 1  # Duplicate detected by DB unique constraint
        
        return jsonify({
            'success': True,
            'count': added_count,
            'duplicates': duplicate_count,
            'filtered_out': filtered_out_count,
            'mode': 'replace' if replace_mode else 'append'
        })
        
    except Exception as e:
        return jsonify({'error': 'upload_failed', 'details': str(e)}), 500


@api_blueprint.route('/file/download', methods=['POST'])
@csrf.exempt
def download_file() -> Dict[str, Any]:
    """Download filtered observations as CSV file - implements 'Datei -> Download'
    
    Cloud Mode: Query database and return CSV
    Local Mode: Proxy to cloud server (send credentials + filters)
    
    Filters observations by user's KK unless user is admin.
    Returns CSV content for client-side file save dialog.
    """
    
    data = request.get_json()
    
    observer_kk = data.get('observerKK')
    password = data.get('password', '')
    use_session = data.get('use_session', False)
    download_all = data.get('download_all', False)
    
    if not observer_kk:
        return jsonify({'error': 'observer_kk_missing'}), 400
    
    # Authentication (both Cloud Mode with session and Local Mode with password)
    try:
        # Authenticate user
        is_admin = False
        authenticated_kk = None
        
        if use_session:
            # Cloud Mode with session
            if not session.get('authenticated', False):
                return jsonify({'error': 'not_authenticated'}), 401
            
            is_admin = session.get('is_admin', False)
            authenticated_kk = session.get('observer_kk')
        else:
            # Cloud Mode with password (proxied from Local Mode)
            if not password:
                return jsonify({'error': 'password_required'}), 400
            
            auth_service = AuthService()
            is_valid, user_kk = auth_service.verify_password(observer_kk, password)
            
            if not is_valid:
                return jsonify({'error': 'invalid_credentials'}), 401
            
            is_admin = (user_kk is None)
            authenticated_kk = user_kk
        
        # Load observations from database (Cloud Server)
        if is_admin or download_all:
            all_observations = obs_db.load_all()
        else:
            all_observations = obs_db.load_filtered(kk=int(authenticated_kk))
        
        if not all_observations:
            return jsonify({'error': 'no_observations'}), 404
        
        # Generate CSV content
        csv_buffer = io.StringIO()
        ObservationCSV.write_to_buffer(all_observations, csv_buffer)
        csv_content = csv_buffer.getvalue()
        
        return jsonify({
            'success': True,
            'csv_content': csv_content,
            'count': len(all_observations),
            'observer_kk': authenticated_kk,
            'is_admin': is_admin
        })
        
    except Exception as e:
        import traceback
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/status', methods=['GET'])
def file_status() -> Dict[str, Any]:
    """Get current file status (loaded file, dirty state)"""
    
    
    auto_loaded = current_app.config.get('AUTO_LOADED', False)
    # Clear the flag after first check
    if auto_loaded:
        current_app.config['AUTO_LOADED'] = False
    
    # Cloud Mode: get count from database, Local Mode: from memory
    if is_cloud_mode():
        obs_count = obs_db.count()
    else:
        obs_count = len(current_app.config.get('OBSERVATIONS', []))
    
    return jsonify({
        'filename': current_app.config.get('LOADED_FILE'),
        'dirty': current_app.config.get('DIRTY', False),
        'count': obs_count,
        'auto_loaded': auto_loaded
    })


@api_blueprint.route('/file/status/update', methods=['POST'])
def update_file_status() -> Dict[str, Any]:
    """Update current filename in backend"""
    
    data = request.get_json()
    filename = data.get('filename')
    
    if filename:
        current_app.config['LOADED_FILE'] = filename
        return jsonify({'success': True, 'filename': filename})
    
    return jsonify({'error': 'No filename provided'}), 400


@api_blueprint.route('/file/autosave', methods=['POST'])
def autosave() -> Dict[str, Any]:
    """Auto-save current observations to .$$$ temp file (Local Mode only)"""
    
    # Cloud Mode: Autosave not supported - database saves immediately
    if is_cloud_mode():
        return jsonify({'error': 'Autosave not supported in cloud mode'}), 400
    
    filename = current_app.config.get('LOADED_FILE')
    if not filename:
        return jsonify({'error': 'No file loaded'}), 400
    
    observations = current_app.config.get('OBSERVATIONS', [])
    if not observations:
        return jsonify({'error': 'No observations to save'}), 400
    
    try:
        # NEW CODE - Using io.observations_file
        temp_path = obs_file.create_temp_backup(observations, filename)
        
        return jsonify({
            'success': True,
            'temp_file': temp_path.name,
            'count': len(observations)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/check_autosave', methods=['GET'])
def check_autosave() -> Dict[str, Any]:
    """Check if any .$$$ autosave files exist in temp directory"""
    temppath = Path(__file__).parent.parent.parent.parent / 'temp'
    
    if not temppath.exists():
        return jsonify({'found': False})
    
    # Find all .$$$ files
    autosave_files = list(temppath.glob('*.$$$'))
    
    if not autosave_files:
        return jsonify({'found': False})
    
    # Get the most recent one
    most_recent = max(autosave_files, key=lambda p: p.stat().st_mtime)
    original_name = most_recent.stem + '.CSV'
    
    return jsonify({
        'found': True,
        'temp_file': most_recent.name,
        'original_file': original_name,
        'modified': most_recent.stat().st_mtime
    })


@api_blueprint.route('/file/restore_autosave', methods=['POST'])
def restore_autosave() -> Dict[str, Any]:
    """Restore observations from .$$$ autosave file (Local Mode only)"""
    
    # Cloud Mode: No autosave files to restore
    if is_cloud_mode():
        return jsonify({'error': 'Not available in cloud mode'}), 400
    
    data = request.get_json() or {}
    temp_filename = data.get('temp_file')
    
    if not temp_filename:
        return jsonify({'error': 'Temp filename required'}), 400
    
    temppath = Path(__file__).parent.parent.parent.parent / 'temp'
    temp_filepath = temppath / temp_filename
    
    if not temp_filepath.exists():
        return jsonify({'error': 'Autosave file not found'}), 404
    
    try:
        # NEW CODE - Using io.observations_file
        # Extract base filename (without .$$$) to pass to restore_from_temp
        base_filename = os.path.splitext(temp_filename)[0] + '.csv'
        observations = obs_file.restore_from_temp(base_filename)
        
        # Store in app config
        current_app.config['OBSERVATIONS'] = observations
        
        # Set original filename (without .$$$)
        original_name = os.path.splitext(temp_filename)[0] + '.CSV'
        current_app.config['LOADED_FILE'] = original_name
        current_app.config['DIRTY'] = True  # Mark as dirty since restored from temp
        
        # DO NOT delete the temp file - keep it until user explicitly saves
        # If browser crashes again before save, we can recover from it
        
        return jsonify({
            'success': True,
            'filename': original_name,
            'count': len(observations)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/cleanup_autosave', methods=['POST'])
def cleanup_autosave() -> Dict[str, Any]:
    """Delete .$$$ autosave file after successful save"""
    data = request.get_json() or {}
    temp_file = data.get('temp_file')
    
    # If temp_file is provided, delete that specific file
    if temp_file:
        temppath = Path(__file__).parent.parent.parent.parent / 'temp'
        temp_filepath = temppath / temp_file
        try:
            if temp_filepath.exists():
                temp_filepath.unlink()
                return jsonify({'success': True, 'deleted': True})
            else:
                return jsonify({'success': True, 'deleted': False})
        except Exception as e:
            return jsonify({'success': True, 'warning': str(e)})
    
    # Otherwise, use LOADED_FILE to determine temp file
    filename = current_app.config.get('LOADED_FILE')
    if not filename:
        return jsonify({'success': True})  # No file loaded, nothing to clean
    
    try:
        # Use io.observations_file to delete temp file
        deleted = obs_file.delete_temp_file(filename)
        if deleted:
            return jsonify({'success': True, 'deleted': True})
        else:
            return jsonify({'success': True, 'deleted': False})
    except Exception as e:
        # Don't fail if cleanup fails
        return jsonify({'success': True, 'warning': str(e)})
