"""Observer management API endpoints.

Routes: /observers (GET/POST/DELETE), /observers/list, /observers/regions,
        /observers/<kk> (PUT), /observers/<kk>/sites (GET/PUT/DELETE),
        /observers/<kk>/active,
        /observers/upload, /observers/download, /observers/save, /observers/reload

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

import csv
import io
import traceback
from io import StringIO
from typing import Dict, Any

from flask import jsonify, request, current_app, session, g

from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.models.constants import YEAR_MIN, jj_to_full_year
from halo.resources.i18n import get_i18n
from halo.services.auth import AuthService
from halo.web.extensions import csrf
import halo.io.observers as observer_logic
import halo.io.observers_file as observer_file
import halo.io.observers_db as observer_db
from halo.io import db_connection
from ._helpers import _check_cloud_write_auth, _parse_seit, _observer_row_to_dict


@api_blueprint.route('/observers/upload', methods=['POST'])
@csrf.exempt
def upload_observers() -> Dict[str, Any]:
    """Upload observer data to server - replaces existing data
    
    Supports two authentication modes:
    1. Session-based (cloud mode): user authenticated via session
    2. Password-based (local mode): user provides credentials
    
    Admin can upload all observers, regular users only their own.
    """

    data = request.get_json()
    observers = data.get('observers', [])
    use_session = data.get('use_session', False)  # True in Cloud Mode
    observer_kk = data.get('observerKK')
    password = data.get('password', '')
    
    # Validate parameters
    if not observers:
        return jsonify({'error': 'no_observer_data_to_upload'}), 400

    # Normalize and pre-validate uploaded records.
    # Accept list rows or dict rows, strip UTF-8 BOM in KK, and ignore header/malformed rows.
    normalized_observers = []
    for obs_record in observers:
        if isinstance(obs_record, list):
            if len(obs_record) < 21:
                continue
            rec_kk = str(obs_record[0]).strip().lstrip('\ufeff')
            if not rec_kk or rec_kk.upper() == 'KK':
                continue
            if not rec_kk.isdigit():
                continue
            normalized_row = list(obs_record)
            normalized_row[0] = rec_kk
            normalized_observers.append(normalized_row)
        elif isinstance(obs_record, dict):
            rec_kk = str(obs_record.get('KK', '')).strip().lstrip('\ufeff')
            if not rec_kk or rec_kk.upper() == 'KK':
                continue
            if not rec_kk.isdigit():
                continue
            normalized_record = dict(obs_record)
            normalized_record['KK'] = rec_kk
            normalized_observers.append(normalized_record)

    observers = normalized_observers
    if not observers:
        return jsonify({'error': 'no_observer_data_to_upload'}), 400
    
    # Authentication (both Cloud Mode with session and Local Mode with password)
    try:
        # Authenticate user
        is_admin = False
        authenticated_kk = None
        
        if use_session:
            # Cloud Mode with session (user already logged in)
            if not session.get('authenticated', False):
                return jsonify({'error': 'not_authenticated'}), 401
            
            is_admin = session.get('is_admin', False)
            authenticated_kk = session.get('observer_kk')  # None for admin
        else:
            # Cloud Mode with password (proxied from Local Mode)
            if not observer_kk or not password:
                return jsonify({'error': 'observer_kk_password_required'}), 400
            
            auth_service = AuthService()
            is_valid, user_kk = auth_service.verify_password(observer_kk, password)
            
            if not is_valid:
                return jsonify({'error': 'invalid_credentials'}), 401
            
            is_admin = (user_kk is None)  # None = admin
            authenticated_kk = user_kk
        
        # SECURITY: Filter observers to only include authenticated user's data (unless admin)
        if not is_admin:
            # Regular user: filter to only their own KK
            filtered_observers = []
            rejected_count = 0
            
            for obs_record in observers:
                # obs_record is a raw list from frontend JSON upload
                record_kk = str(obs_record[0]) if isinstance(obs_record, list) else str(obs_record.get('KK', ''))
                if record_kk == str(authenticated_kk):
                    filtered_observers.append(obs_record)
                else:
                    rejected_count += 1
            
            if rejected_count > 0:
                observers = filtered_observers
                if not observers:
                    return jsonify({
                        'error': 'all_records_rejected',
                        'details': {
                            'authenticated_kk': authenticated_kk,
                            'rejected_count': rejected_count
                        }
                    }), 403
        # Admin: no filtering needed, can upload all observers
        
        # Database operations (Cloud Mode only - Local Mode exits early above)
        # Replace mode: Remove all existing records for uploaded observers
        uploaded_kks = set()
        for obs_record in observers:
            # obs_record is a raw list from frontend JSON upload
            rec_kk = obs_record[0] if isinstance(obs_record, list) else obs_record.get('KK', '')
            if rec_kk:
                uploaded_kks.add(int(str(rec_kk).strip().lstrip('\ufeff')))
        
        # Delete existing records for uploaded KKs
        try:
            for kk in uploaded_kks:
                existing_records = observer_db.load_filtered(kk=kk)
                for i, record in enumerate(existing_records):
                    # Database dict keys can be mixed-case depending on query/result mapping.
                    # Accept canonical keys (KK, seit) and legacy fallbacks (kk, since).
                    record_kk = (
                        record.get('KK')
                        if isinstance(record, dict)
                        else record[0]
                    )
                    if isinstance(record, dict) and record_kk is None:
                        record_kk = record.get('kk')

                    record_since = (
                        record.get('seit')
                        if isinstance(record, dict)
                        else record[2]
                    )
                    if isinstance(record, dict) and record_since is None:
                        record_since = record.get('since')

                    if record_kk is None or record_since is None:
                        continue

                    # Delete by kk and since (unique key)
                    observer_db.delete_one(int(record_kk), record_since)
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise
        
        # Add new observer records to database.
        # Robustness: skip malformed rows instead of aborting the whole upload with 500.
        saved_count = 0
        skipped_count = 0
        row_errors = []
        for i, obs_record in enumerate(observers):
            try:
                # Convert array to dict if needed (database expects dict format)
                if isinstance(obs_record, list):
                    observer_dict = _observer_row_to_dict(obs_record)
                else:
                    observer_dict = obs_record

                if observer_db.save_one(observer_dict):
                    saved_count += 1
            except Exception as row_error:
                skipped_count += 1
                if len(row_errors) < 10:
                    row_errors.append({
                        'row_index': i,
                        'kk': str(obs_record[0]).strip() if isinstance(obs_record, list) and obs_record else str(obs_record.get('KK', '')).strip() if isinstance(obs_record, dict) else '',
                        'error': str(row_error)
                    })
                continue

        if saved_count == 0:
            return jsonify({'error': 'no_observer_data_to_upload'}), 400

        if skipped_count > 0:
            current_app.logger.warning(
                'upload_observers: skipped malformed rows',
                extra={
                    'skipped_count': skipped_count,
                    'row_errors': row_errors,
                    'requested_count': len(observers)
                }
            )
        
        # Get total count from database for response
        total_count = observer_db.count()
        
        return jsonify({
            'success': True,
            'count': saved_count,
            'skipped': skipped_count,
            'row_errors': row_errors,
            'total_count': total_count
        })
        
    except Exception as e:
        current_app.logger.exception(
            'upload_observers failed',
            extra={
                'use_session': use_session,
                'is_admin': bool(session.get('is_admin', False)),
                'authenticated': bool(session.get('authenticated', False)),
                'observer_kk': observer_kk,
                'records_received': len(observers) if isinstance(observers, list) else 0
            }
        )
        return jsonify({
            'error': 'upload_failed',
            'details': str(e),
            'debug': {
                'traceback': traceback.format_exc()
            }
        }), 500


@api_blueprint.route('/observers/download', methods=['POST'])
@csrf.exempt
def download_observers() -> Dict[str, Any]:
    """Download observer data as CSV file
    
    Cloud Mode: Query database and return CSV
    Local Mode: Proxy to cloud server (send credentials)
    
    Filters by user's KK unless user is admin or download_all=true.
    Authentication is REQUIRED in both modes for security.
    """
    
    data = request.get_json()
    use_session = data.get('use_session', False)
    observer_kk = data.get('observerKK')
    password = data.get('password', '')
    download_all = data.get('download_all', False)
    
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
            if not observer_kk or not password:
                return jsonify({'error': 'observer_kk_password_required'}), 400
            
            auth_service = AuthService()
            is_valid, user_kk = auth_service.verify_password(observer_kk, password)
            
            if not is_valid:
                return jsonify({'error': 'invalid_credentials'}), 401
            
            is_admin = (user_kk is None)
            authenticated_kk = user_kk
        
        # Load observers from database - filter by KK unless admin or download_all
        if is_admin or download_all:
            all_observers = observer_db.load_all()
        else:
            all_observers = observer_db.load_filtered(kk=int(authenticated_kk))
        
        if not all_observers:
            return jsonify({'error': 'no_observers'}), 404
        
        # Generate CSV content using DictWriter with canonical field order
        csv_buffer = io.StringIO()
        writer = csv.DictWriter(csv_buffer, fieldnames=observer_file.OBSERVER_FIELDS, extrasaction='ignore')
        writer.writerows(all_observers)
        csv_content = csv_buffer.getvalue()
        
        return jsonify({
            'success': True,
            'csv_content': csv_content,
            'count': len(all_observers)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observers/save', methods=['POST'])
def save_observers() -> Dict[str, Any]:
    """Save observer CSV content to resources/halobeo.csv (Local Mode only)
    
    Merges downloaded observers with existing ones:
    - Keeps all observers NOT in the downloaded data
    - Replaces observers that ARE in the downloaded data
    """
    
    if is_cloud_mode():
        return jsonify({'error': 'not_available_in_cloud_mode'}), 400
    
    data = request.get_json()
    csv_content = data.get('csv_content', '')
    
    if not csv_content:
        return jsonify({'error': 'no_csv_content'}), 400
    
    try:
        # Parse downloaded CSV content to list of dicts using OBSERVER_FIELDS
        downloaded_observers = []
        csv_reader = csv.DictReader(io.StringIO(csv_content), fieldnames=observer_file.OBSERVER_FIELDS)
        for row in csv_reader:
            # Skip header row if present
            if row.get('KK', '') == 'KK':
                continue
            if row.get('KK', '').isdigit():  # Skip empty lines
                downloaded_observers.append(dict(row))
        
        # Get list of KKs in downloaded data
        downloaded_kks = set()
        for obs in downloaded_observers:
            downloaded_kks.add(int(obs['KK']))
        
        # Load existing observers from file
        existing_observers, file_path = observer_file.open_file()
        
        # Keep only observers NOT in the downloaded data
        kept_observers = [obs for obs in existing_observers if int(obs['KK']) not in downloaded_kks]
        
        # Combine: kept observers + downloaded observers
        merged_observers = kept_observers + downloaded_observers
        
        # Sort using Layer 2 sort logic
        merged_observers = observer_logic.sort_observers(merged_observers)
        
        # Save merged list to file
        observer_file.save_file(merged_observers, file_path)
        
        return jsonify({
            'success': True,
            'file': 'halobeo.csv',
            'downloaded_kks': list(downloaded_kks),
            'kept_count': len(kept_observers),
            'downloaded_count': len(downloaded_observers),
            'total_count': len(merged_observers)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observers/reload', methods=['POST'])
def reload_observers() -> Dict[str, Any]:
    """Reload observers from resources/halobeo.csv into memory (Local Mode only)"""
    
    if is_cloud_mode():
        return jsonify({'error': 'not_available_in_cloud_mode'}), 400
    
    try:
        # Reload observers from file
        observers, _ = observer_file.open_file()
        current_app.config['OBSERVERS'] = observers
        
        return jsonify({
            'success': True,
            'count': len(observers)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observers', methods=['GET'])
def get_observers() -> Dict[str, Any]:
    """Get observer records with optional filtering.
    
    Query parameters:
        filter_type: 'none', 'kk', 'site', 'region'
        filter_value: Filter value (KK for kk, site name for site, region number for region)
        latest_only: 'true' to show only the latest site per observer (default), 'false' to show all
        kk: Observer code (for single observer lookup)
        jj: Year (2-digit) for observation date filtering
        mm: Month (1-12) for observation date filtering
    """
    
    filter_type = request.args.get('filter_type', 'none')
    filter_value = request.args.get('filter_value', '')
    latest_only = request.args.get('latest_only', 'true').lower() == 'true'
    
    # Special case: single observer lookup by KK with JJ/MM date filtering
    kk_param = request.args.get('kk', '').strip()
    jj_param = request.args.get('jj', '').strip()
    mm_param = request.args.get('mm', '').strip()
    
    if kk_param and jj_param and mm_param:
        try:
            jj = int(jj_param)
            mm = int(mm_param)
            
            # Normalize 4-digit year to 2-digit for seit comparison
            if jj >= 100:
                jj = jj % 100
            
            # Use database filtering for date-based observer lookup
            if is_cloud_mode():
                kk_records = observer_db.load_filtered(kk=kk_param, jj=jj, mm=mm)
            else:
                # Local Mode: Find all records for this observer
                observers = current_app.config.get('OBSERVERS', [])
                kk_records = [obs for obs in observers if obs['KK'] == kk_param]
                
                # Handle century boundary for observation year (same as _parse_seit)
                # Years 00-((YEAR_MIN-1900)-1) are treated as 2000-20xx, so add 100 to year
                if jj < (YEAR_MIN-1900):
                    jj += 100
                
                # Calculate seit value for observation date: month + 13 × year
                obs_seit = mm + 13 * jj
                kk_records = [obs for obs in kk_records if obs['seit'] and _parse_seit(obs['seit']) <= obs_seit]
            
            if kk_records:
                latest_record = max(kk_records, key=lambda obs: _parse_seit(obs['seit'])) if kk_records else None
                
                if latest_record:
                    result = {
                        'KK': latest_record['KK'],
                        'VName': latest_record['VName'],
                        'NName': latest_record['NName'],
                        'seit': latest_record['seit'],
                        'aktiv': str(latest_record['aktiv']),
                        'HbOrt': latest_record['HbOrt'],
                        'GH': latest_record['GH'],
                        'GN': latest_record['GN']
                    }
                    return jsonify({'observer': result})
            
            # If no matching record found, return empty
            return jsonify({'observer': None})
        except (ValueError, IndexError) as e:
            return jsonify({'error': f'Invalid parameters: {e}'}), 400
    
    # Get observers based on deployment mode and filters
    if is_cloud_mode():
        # Cloud Mode: Use database filtering directly
        if filter_type == 'kk' and filter_value:
            observers = observer_db.load_filtered(kk=int(filter_value), latest_only=latest_only)
        elif filter_type == 'site' and filter_value:
            observers = observer_db.load_filtered(standort=filter_value, latest_only=latest_only)
        elif filter_type == 'region' and filter_value:
            observers = observer_db.load_filtered(region=int(filter_value), latest_only=latest_only)
        else:
            observers = observer_db.load_filtered(latest_only=latest_only)
        
        # observer_db now returns CSV-compatible format directly
        # Convert aktiv from int to string for consistency
        result = []
        for obs in observers:
            obs_copy = obs.copy()
            obs_copy['aktiv'] = str(obs_copy['aktiv'])  # Convert 0/1 to '0'/'1'
            result.append(obs_copy)
        
        return jsonify({'observers': result})
    else:
        # Local Mode: Load observers from app config (CSV) and filter in Python
        observers = current_app.config.get('OBSERVERS', [])
    
    if filter_type == 'none':
        # Return all observers
        filtered = observers
    elif filter_type == 'kk':
        # Filter by observer ID (KK field)
        filtered = [obs for obs in observers if obs['KK'] == filter_value]
    elif filter_type == 'site':
        # Filter by observation site (HbOrt, NbOrt)
        search_term = filter_value.lower()
        filtered = [obs for obs in observers 
                   if search_term in obs['HbOrt'].lower() or search_term in obs['NbOrt'].lower()]
    elif filter_type == 'region':
        # Filter by geographic region (GH, GN)
        filtered = [obs for obs in observers 
                   if str(obs['GH']) == filter_value or str(obs['GN']) == filter_value]
    else:
        filtered = observers
    
    # Filter to latest site only if requested
    if latest_only:
        # Group by KK and keep only the record with the latest 'seit' date
        latest_sites = {}
        for obs in filtered:
            kk = obs['KK']
            seit = obs['seit']  # seit field in MM/YY format
            
            # Parse seit (MM/YY) to compare dates
            try:
                month, year = map(int, seit.split('/'))
                # Convert to full year using (YEAR_MIN-1900)
                full_year = jj_to_full_year(year)
                date_key = (full_year, month)
                
                if kk not in latest_sites or date_key > latest_sites[kk][1]:
                    latest_sites[kk] = (obs, date_key)
            except (ValueError, AttributeError):
                # If date parsing fails, keep the record
                if kk not in latest_sites:
                    latest_sites[kk] = (obs, (0, 0))
        
        filtered = [obs_tuple[0] for obs_tuple in latest_sites.values()]
    
    # obs is already a dict - just append directly
    result = [dict(obs) for obs in filtered]
    
    return jsonify({'observers': result, 'count': len(result)})


@api_blueprint.route('/observers/list', methods=['GET'])
def get_observers_list() -> Dict[str, Any]:
    """Get list of unique observers (KK + Name) for dropdown.
    
    This endpoint does NOT require authentication - it's used by login, upload, and download dialogs.
    """
    
    # Check if only registered users (with AWS passwords) should be returned
    registered_only = request.args.get('registered_only', '').lower() == 'true'
    registered_usernames = None
    if registered_only and is_cloud_mode():
        registered_usernames = AuthService.get_registered_usernames()
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        # Cloud Mode: Direct database access WITHOUT session filtering
        # This is public data needed for login dropdown
        try:
            with db_connection.get_connection() as conn:
                cursor = conn.cursor()
                
                # Get latest record per observer (highest 'seit' value)
                # PostgreSQL: DISTINCT ON syntax
                query = """
                    SELECT DISTINCT ON (\"KK\") 
                        \"KK\", \"VName\", \"NName\", \"seit\"
                    FROM observers
                    ORDER BY \"KK\", \"seit\" DESC
                """
                cursor.execute(query)
                db_observers = cursor.fetchall()
                cursor.close()
                
                # Convert to standardized format (rows are tuples: (KK, VName, NName, seit))
                observers = []
                for obs in db_observers:
                    # If registered_only, skip observers without AWS password
                    if registered_usernames is not None:
                        kk_str = str(obs[0])
                        if kk_str not in registered_usernames:
                            continue
                    observers.append({
                        'KK': obs[0],
                        'VName': obs[1] or '',
                        'NName': obs[2] or ''
                    })
                
        except Exception:
            # On any error, return empty list but still return valid JSON
            observers = []
    else:
        # Local Mode: Get from app config (CSV)
        csv_observers = current_app.config.get('OBSERVERS', [])
        
        # Get unique observers by KK (only latest record)
        unique_observers = {}
        for obs in csv_observers:
            kk = obs['KK']
            vname = obs['VName'] if obs['VName'] else ''
            nname = obs['NName'] if obs['NName'] else ''
            
            # Skip if KK is empty or both names are empty
            if not kk or (not vname and not nname):
                continue
                
            if kk not in unique_observers:
                unique_observers[kk] = {
                    'KK': kk,
                    'VName': vname,
                    'NName': nname
                }
        
        # Convert to list
        observers = list(unique_observers.values())
    
    # Sort by KK (handle both int and string types)
    observers.sort(key=lambda x: int(x['KK']) if isinstance(x['KK'], str) and x['KK'].isdigit() else (x['KK'] if isinstance(x['KK'], int) else 0))
    
    result = {'observers': observers}
    # Include admin flag when filtering for registered users
    if registered_usernames is not None:
        result['has_admin'] = 'admin' in registered_usernames
    
    return jsonify(result)


@api_blueprint.route('/observers/regions', methods=['GET'])
def get_observer_regions() -> Dict[str, Any]:
    """Get list of unique geographic regions for dropdown."""
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        observers = observer_db.load_filtered()  # All observer records (returns dicts)
    else:
        observers = current_app.config.get('OBSERVERS', [])  # Returns lists
    
    # Get unique regions
    regions = set()
    for obs in observers:
        regions.add(int(obs['GH']))   # HbReg - Hauptbeobachtungsort Region
        regions.add(int(obs['GN']))   # NbReg - Nebenbeobachtungsort Region
    
    # Get region names from i18n (no fallbacks)
    i18n = g.i18n if hasattr(g, 'i18n') else get_i18n()
    region_names = i18n.get_array('geographic_regions')

    # Sort and create list with region numbers + localized names
    region_list = []
    for r in sorted(regions):
        if r <= 0:
            continue
        region_list.append({'number': r, 'name': region_names[str(r)]})
    
    return jsonify({'regions': region_list})


@api_blueprint.route('/observers', methods=['POST'])
def add_observer() -> Dict[str, Any]:
    """Add a new observer to halobeo.csv.
    
    Expected JSON payload:
        KK: Observer code (01-99)
        VName: First name (max 15 chars)
        NName: Last name (max 15 chars)
        seit_month: Month (1-12)
        seit_year: Year (2-digit or 4-digit)
        active: 1 for active, 0 for inactive
        HbOrt: Main observation site name (max 20 chars)
        GH: Main site geographic region (1-39)
        HLG: Main site longitude degrees
        HLM: Main site longitude minutes
        HOW: Main site longitude hemisphere (O/W)
        HBG: Main site latitude degrees
        HBM: Main site latitude minutes
        HNS: Main site latitude hemisphere (N/S)
        NbOrt: Secondary observation site name (max 20 chars)
        GN: Secondary site geographic region (1-39)
        NLG: Secondary site longitude degrees
        NLM: Secondary site longitude minutes
        NOW: Secondary site longitude hemisphere (O/W)
        NBG: Secondary site latitude degrees
        NBM: Secondary site latitude minutes
        NNS: Secondary site latitude hemisphere (N/S)
    """
    
    data = request.get_json() or {}
    
    # Validate required fields
    required_fields = ['KK', 'VName', 'NName', 'seit_month', 'seit_year', 'active']
    for field in required_fields:
        if field not in data or data[field] == '':
            return jsonify({'error': 'missing_required_field', 'field': field}), 400
    
    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(data.get('KK'))
    if auth_error:
        return auth_error
    
    # Validate KK format (must be 2-digit string between 01 and 99)
    kk = str(data['KK']).zfill(2)
    try:
        kk_int = int(kk)
        if kk_int < 1 or kk_int > 99:
            return jsonify({'error': 'invalid_kk_range'}), 400
    except ValueError:
        return jsonify({'error': 'invalid_kk_format'}), 400
    
    # Check if KK already exists (don't allow any duplicate KK at all)
    if is_cloud_mode():
        observers = observer_db.load_filtered(kk=kk)
    else:
        observers = current_app.config.get('OBSERVERS', [])
    
    seit_str = f"{int(data['seit_month']):02d}/{int(data['seit_year']) % 100:02d}"
    
    # Check if this KK already exists (any observer with this KK)
    for obs in observers:
        if obs['KK'] == kk:
            return jsonify({'error': 'observer_code_exists', 'kk': kk}), 400
    
    # Build the observer record as dict
    # Keys: KK,VName,NName,seit,aktiv,HbOrt,GH,HLG,HLM,HOW,HBG,HBM,HNS,NbOrt,GN,NLG,NLM,NOW,NBG,NBM,NNS
    new_row = {
        'KK': kk,
        'VName': data.get('VName', '')[:15],
        'NName': data.get('NName', '')[:15],
        'seit': seit_str,
        'aktiv': str(data.get('active', 1)),
        'HbOrt': data.get('HbOrt', '')[:20],
        'GH': str(data.get('GH', 0)),
        'HLG': str(data.get('HLG', 0)),
        'HLM': str(data.get('HLM', 0)),
        'HOW': data.get('HOW', 'O'),
        'HBG': str(data.get('HBG', 0)),
        'HBM': str(data.get('HBM', 0)),
        'HNS': data.get('HNS', 'N'),
        'NbOrt': data.get('NbOrt', '')[:20],
        'GN': str(data.get('GN', 0)),
        'NLG': str(data.get('NLG', 0)),
        'NLM': str(data.get('NLM', 0)),
        'NOW': data.get('NOW', 'O'),
        'NBG': str(data.get('NBG', 0)),
        'NBM': str(data.get('NBM', 0)),
        'NNS': data.get('NNS', 'N')
    }
    
    # Add observer using io module
    try:
        if is_cloud_mode():
            # Cloud Mode: Direct SQL INSERT
            record_dict = _observer_row_to_dict(new_row) if isinstance(new_row, list) else new_row
            success = observer_db.save_one(record_dict)
            if not success:
                return jsonify({'error': 'observer_site_exists', 'kk': kk, 'seit': seit_str}), 400
        else:
            # Local Mode: Add record (Layer 2) + Save to file (Layer 3a)
            observers = observer_logic.add_observer_record(new_row, observers)
            observer_file.save_file(observers)
            current_app.config['OBSERVERS'] = observers
        
        return jsonify({
            'success': True,
            'observer': {
                'KK': kk,
                'VName': new_row['VName'],
                'NName': new_row['NName'],
                'seit': seit_str
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'observer_save_failed', 'details': str(e)}), 500


@api_blueprint.route('/observers/<kk>', methods=['PUT'])
def update_observer(kk: str) -> Dict[str, Any]:
    """Update observer base data (VName and NName only) in halobeo.csv and all observations in haloobs.csv.
    
    Args:
        kk: Observer code (01-99)
        
    Expected JSON payload:
        VName: First name (max 15 chars)
        NName: Last name (max 15 chars)
        
    Note: seit and active are bound to observation sites and cannot be changed here.
    """
    data = request.get_json() or {}
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error
    
    # Validate required fields (only VName and NName are editable in base data)
    required_fields = ['VName', 'NName']
    for field in required_fields:
        if field not in data or data[field] == '':
            return jsonify({'error': 'missing_required_field', 'field': field}), 400
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        observers = observer_db.load_filtered(kk=kk)
    else:
        observers = current_app.config.get('OBSERVERS', [])
    
    # Find all observer entries with this KK
    if not observers or len(observers) == 0:
        return jsonify({'error': 'observer_not_found', 'kk': kk}), 404
    
    try:
        if is_cloud_mode():
            # Cloud Mode: True SQL UPDATE (no delete+insert needed)
            # observers is a list of dicts from load_filtered()
            updated_count = 0
            for obs in observers:
                # Build updated record dict with new VName/NName (all Python field names)
                updated_record = {
                    'KK': kk,
                    'aktiv': obs['aktiv'],  # unchanged
                    'seit': obs['seit'],  # unchanged
                    'VName': data.get('VName', '')[:15],  # Python field name
                    'NName': data.get('NName', '')[:15],  # Python field name
                    'HbOrt': obs['HbOrt'],  # unchanged
                    'GH': obs['GH'],  # unchanged
                    'HLG': obs['HLG'],  # unchanged
                    'HLM': obs['HLM'],  # unchanged
                    'HOW': obs['HOW'],  # unchanged
                    'HBG': obs['HBG'],  # unchanged
                    'HBM': obs['HBM'],  # unchanged
                    'HNS': obs['HNS'],  # unchanged
                    'NbOrt': obs['NbOrt'],  # unchanged
                    'GN': obs['GN'],  # unchanged
                    'NLG': obs['NLG'],  # unchanged
                    'NLM': obs['NLM'],  # unchanged
                    'NOW': obs['NOW'],  # unchanged
                    'NBG': obs['NBG'],  # unchanged
                    'NBM': obs['NBM'],  # unchanged
                    'NNS': obs['NNS']  # unchanged
                }
                
                success = observer_db.update_one(kk, obs['seit'], updated_record)
                if success:
                    updated_count += 1
            
            # Get updated record for response
            updated_observers = observer_db.load_filtered(kk=kk)
            first_updated = updated_observers[0] if updated_observers else None
            
            return jsonify({
                'success': True,
                'observer': {
                    'KK': kk,
                    'VName': first_updated['VName'] if first_updated else '',
                    'NName': first_updated['NName'] if first_updated else '',
                    'seit': first_updated['seit'] if first_updated else '',
                    'active': int(first_updated['aktiv']) if first_updated else 0
                }
            })
        else:
            # Local Mode: Update all entries with delete+insert pattern
            observer_indices = []
            for idx, obs in enumerate(observers):
                if obs['KK'] == kk:
                    observer_indices.append(idx)
            
            updated_count = 0
            for idx in observer_indices:
                old_observer = observers[idx]
                # Keep all data unchanged except VName and NName
                updated = dict(old_observer)
                updated['VName'] = data.get('VName', '')[:15]
                updated['NName'] = data.get('NName', '')[:15]
                observers[idx] = updated
                updated_count += 1
            
            # Get the first updated entry for response
            first_updated = observers[observer_indices[0]]
            
            # Sort (Layer 2)
            observers = observer_logic.sort_observers(observers)
            
            # Save to file (Layer 3a)
            observer_file.save_file(observers)
            current_app.config['OBSERVERS'] = observers
            
            # Update metadata in observation files (if loaded)
            observations = current_app.config.get('OBSERVATIONS', [])
            if observations:
                obs_updated_count = 0
                for obs in observations:
                    # Check if observation belongs to this observer
                    if obs.get('KK') == kk:
                        obs['VName'] = first_updated['VName']
                        obs['NName'] = first_updated['NName']
                        obs_updated_count += 1
            
            return jsonify({
                'success': True,
                'observer': {
                    'KK': kk,
                    'VName': first_updated['VName'],
                    'NName': first_updated['NName'],
                    'seit': first_updated['seit'],
                    'active': int(first_updated['aktiv'])
                }
            })
    except Exception as e:
        return jsonify({'error': 'observer_update_failed', 'details': str(e)}), 500


@api_blueprint.route('/observers/<kk>/sites', methods=['GET'])
def get_observer_sites(kk):
    """Get all observation site entries for an observer"""
    
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        # Cloud Mode: Query database directly for this specific observer
        observers = observer_db.load_filtered(kk=kk)
    else:
        # Local Mode: Load observers from app config (CSV)
        observers = current_app.config.get('OBSERVERS', [])
    
    # Find all entries for this observer
    sites = []
    for obs in observers:
        if obs['KK'] != kk:
            continue
        
        seit_parts = obs['seit'].split('/')
        seit_month = int(seit_parts[0])
        seit_year = jj_to_full_year(int(seit_parts[1]))
        
        sites.append({
            'KK': obs['KK'],
            'VName': obs['VName'],
            'NName': obs['NName'],
            'seit': obs['seit'],
            'seit_month': seit_month,
            'seit_year': seit_year,
            'active': int(obs['aktiv']),
            'HbOrt': obs['HbOrt'],
            'GH': obs['GH'],
            'HLG': int(obs['HLG']) if obs['HLG'] else 0,
            'HLM': int(obs['HLM']) if obs['HLM'] else 0,
            'HOW': obs['HOW'],
            'HBG': int(obs['HBG']) if obs['HBG'] else 0,
            'HBM': int(obs['HBM']) if obs['HBM'] else 0,
            'HNS': obs['HNS'],
            'NbOrt': obs['NbOrt'],
            'GN': obs['GN'],
            'NLG': int(obs['NLG']) if obs['NLG'] else 0,
            'NLM': int(obs['NLM']) if obs['NLM'] else 0,
            'NOW': obs['NOW'],
            'NBG': int(obs['NBG']) if obs['NBG'] else 0,
            'NBM': int(obs['NBM']) if obs['NBM'] else 0,
            'NNS': obs['NNS']
        })
    
    if not sites:
        return jsonify({'error': 'Observer not found'}), 404
    
    return jsonify({'sites': sites})


@api_blueprint.route('/observers/<kk>/active', methods=['GET'])
def check_observer_active(kk):
    """Check if observer was active at a given date (MM/JJ)
    
    Query parameters:
        mm: Month (1-12)
        jj: Year (2-digit: (YEAR_MIN-1900)-99 = 19xx, 00-((YEAR_MIN-1900)-1) = 20xx)
    
    Returns:
        {'active': True/False}
        
    Logic:
        Observer is active if there exists a site entry where:
        - seit <= MM/JJ (observer was already active at that date)
        - AND aktiv=1 (site is still active)
        
    Multiple records per observer: Find the LATEST record where seit <= check_date,
    then check if that record has aktiv=1.
    """
    
    # Get MM and JJ from query parameters
    mm = request.args.get('mm', type=int)
    jj = request.args.get('jj', type=int)
    
    if mm is None or jj is None:
        return jsonify({'error': 'Missing mm or jj parameter'}), 400
    
    if mm < 1 or mm > 12:
        return jsonify({'error': 'Invalid month (must be 1-12)'}), 400
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        # Cloud Mode: Query database directly for this specific observer
        observers = observer_db.load_filtered(kk=kk)
    else:
        # Local Mode: Load observers from app config (CSV)
        observers = current_app.config.get('OBSERVERS', [])
    
    # Convert jj to 4-digit year for comparison
    year_4digit = jj_to_full_year(jj)
    check_date = year_4digit * 100 + mm

    # Find all site entries for this observer where seit <= check_date
    matching_records = []
    for obs in observers:
        if obs['KK'] != kk:
            continue
        seit_str = obs['seit']
        
        # Parse seit (start date)
        seit_parts = seit_str.split('/')
        seit_month = int(seit_parts[0])
        seit_year = int(seit_parts[1])
        seit_year_4digit = jj_to_full_year(seit_year)
        seit_date = seit_year_4digit * 100 + seit_month
        
        # Only consider records where seit <= check_date
        if seit_date <= check_date:
            matching_records.append((seit_date, obs))

    # No matching records found
    if not matching_records:
        return jsonify({'active': False})

    # Find the record with the LATEST seit date (most recent before or at check_date)
    matching_records.sort(key=lambda x: x[0], reverse=True)
    latest_record = matching_records[0][1]

    # Check if that record is active (aktiv=1)
    is_active = int(latest_record['aktiv']) == 1

    return jsonify({'active': is_active})


@api_blueprint.route('/observers/<kk>/sites', methods=['PUT'])
def upsert_observer_site(kk):
    """Add or update an observation site entry for an observer.
    
    If 'originalSeit' is present in the request body, update the existing entry.
    If 'originalSeit' is absent, create a new entry.
    """
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error
    
    data = request.get_json() or {}
    
    # Validate required fields
    required_fields = ['seit_month', 'seit_year', 'active', 'HbOrt', 'HBG', 'HBM', 
                       'HNS', 'HLG', 'HLM', 'HOW', 'GH']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': 'missing_required_field', 'field': field}), 400
    
    # Determine mode: update (originalSeit present) or add (absent)
    original_seit = data.get('originalSeit')
    is_update = original_seit is not None
    
    # Convert seit_month/seit_year to seit format (MM/YY)
    new_seit = f"{int(data['seit_month']):02d}/{int(data['seit_year']) % 100:02d}"
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        observers = observer_db.load_filtered(kk=kk)
    else:
        observers = current_app.config.get('OBSERVERS', [])
    
    # Find an existing entry for this observer
    existing = None
    for obs in observers:
        if obs['KK'] == kk:
            existing = obs
            break
    
    if not existing:
        return jsonify({'error': 'observer_not_found', 'kk': kk}), 404
    
    try:
        if is_update:
            # === UPDATE existing site entry ===
            if is_cloud_mode():
                # Cloud Mode: True SQL UPDATE
                matching_obs = None
                for obs in observers:
                    if obs['KK'] == kk and obs['seit'] == original_seit:
                        matching_obs = obs
                        break
                
                if not matching_obs:
                    return jsonify({'error': 'site_entry_not_found'}), 404
                
                updated_row = [
                    kk,
                    data.get('VName', matching_obs['VName']),
                    data.get('NName', matching_obs['NName']),
                    new_seit,
                    str(data.get('active', 1)),
                    data.get('HbOrt', ''),
                    data.get('GH', ''),
                    str(data.get('HLG', 0)),
                    str(data.get('HLM', 0)),
                    data.get('HOW', 'O'),
                    str(data.get('HBG', 0)),
                    str(data.get('HBM', 0)),
                    data.get('HNS', 'N'),
                    data.get('NbOrt', ''),
                    data.get('GN', ''),
                    str(data.get('NLG', 0)),
                    str(data.get('NLM', 0)),
                    data.get('NOW', 'O'),
                    str(data.get('NBG', 0)),
                    str(data.get('NBM', 0)),
                    data.get('NNS', 'N')
                ]
                
                updated_dict = _observer_row_to_dict(updated_row)
                success = observer_db.update_one(kk, original_seit, updated_dict)
                if not success:
                    return jsonify({'error': 'site_update_failed', 'kk': kk, 'seit': original_seit}), 500
                
                return jsonify({'success': True})
            else:
                # Local Mode: Update in place
                entry_found = False
                updated_observers = []
                for obs in observers:
                    if obs['KK'] == kk and obs['seit'] == original_seit:
                        entry_found = True
                        updated_row = {
                            'KK': kk,
                            'VName': data.get('VName', obs.get('VName', '')),
                            'NName': data.get('NName', obs.get('NName', '')),
                            'seit': new_seit,
                            'aktiv': str(data.get('active', 1)),
                            'HbOrt': data.get('HbOrt', ''),
                            'GH': data.get('GH', ''),
                            'HLG': str(data.get('HLG', 0)),
                            'HLM': str(data.get('HLM', 0)),
                            'HOW': data.get('HOW', 'O'),
                            'HBG': str(data.get('HBG', 0)),
                            'HBM': str(data.get('HBM', 0)),
                            'HNS': data.get('HNS', 'N'),
                            'NbOrt': data.get('NbOrt', ''),
                            'GN': data.get('GN', ''),
                            'NLG': str(data.get('NLG', 0)),
                            'NLM': str(data.get('NLM', 0)),
                            'NOW': data.get('NOW', 'O'),
                            'NBG': str(data.get('NBG', 0)),
                            'NBM': str(data.get('NBM', 0)),
                            'NNS': data.get('NNS', 'N')
                        }
                        updated_observers.append(updated_row)
                    else:
                        updated_observers.append(obs)
                
                if not entry_found:
                    return jsonify({'error': 'site_entry_not_found', 'kk': kk, 'seit': original_seit}), 404
                
                def sort_key(obs):
                    kk_val = obs['KK']
                    seit_parts = obs['seit'].split('/')
                    month = int(seit_parts[0])
                    year = int(seit_parts[1])
                    full_year = jj_to_full_year(year)
                    return (kk_val, full_year * 100 + month)
                
                updated_observers.sort(key=sort_key)
                updated_observers = observer_logic.sort_observers(updated_observers)
                observer_file.save_file(updated_observers)
                current_app.config['OBSERVERS'] = updated_observers
                
                return jsonify({'success': True})
        else:
            # === ADD new site entry ===
            # Check if entry with this seit already exists
            for obs in observers:
                if obs['KK'] == kk and obs['seit'] == new_seit:
                    return jsonify({'error': 'site_date_exists', 'kk': kk, 'seit': new_seit}), 400
            
            new_row = {
                'KK': kk,
                'VName': existing['VName'],
                'NName': existing['NName'],
                'seit': new_seit,
                'aktiv': str(data['active']),
                'HbOrt': data['HbOrt'],
                'GH': data['GH'],
                'HLG': str(data['HLG']),
                'HLM': str(data['HLM']),
                'HOW': data['HOW'],
                'HBG': str(data['HBG']),
                'HBM': str(data['HBM']),
                'HNS': data['HNS'],
                'NbOrt': data.get('NbOrt', ''),
                'GN': data.get('GN', ''),
                'NLG': str(data.get('NLG', 0)),
                'NLM': str(data.get('NLM', 0)),
                'NOW': data.get('NOW', ''),
                'NBG': str(data.get('NBG', 0)),
                'NBM': str(data.get('NBM', 0)),
                'NNS': data.get('NNS', '')
            }
            
            if is_cloud_mode():
                record_dict = _observer_row_to_dict(new_row) if isinstance(new_row, list) else new_row
                success = observer_db.save_one(record_dict)
                if not success:
                    return jsonify({'error': 'site_date_exists', 'seit': new_seit}), 400
            else:
                observers.append(new_row)
                
                def sort_key(obs):
                    kk_val = obs['KK']
                    seit_val = obs['seit']
                    if seit_val and '/' in seit_val:
                        parts = seit_val.split('/')
                        if len(parts) == 2:
                            month = int(parts[0])
                            year = int(parts[1])
                            full_year = jj_to_full_year(year)
                            return (kk_val, full_year * 100 + month)
                    return (kk_val, 0)
                
                observers.sort(key=sort_key)
                observers = observer_logic.sort_observers(observers)
                observer_file.save_file(observers)
                current_app.config['OBSERVERS'] = observers
            
            return jsonify({
                'success': True,
                'site': {
                    'KK': new_row['KK'],
                    'seit': new_row['seit'],
                    'active': int(new_row['aktiv'])
                }
            })
    except Exception as e:
        error_key = 'site_update_failed' if is_update else 'site_add_failed'
        return jsonify({'error': error_key, 'details': str(e)}), 500


@api_blueprint.route('/observers/<kk>/sites', methods=['DELETE'])
def delete_observer_site(kk):
    """Delete an observation site entry for an observer"""
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error
    
    # Get seit from request body
    data = request.get_json()
    if not data:
        return jsonify({'error': 'no_data_provided'}), 400
    
    seit = data.get('seit')
    if not seit:
        return jsonify({'error': 'seit_required'}), 400
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        observers = observer_db.load_filtered(kk=kk)
    else:
        observers = current_app.config.get('OBSERVERS', [])
    
    # Count how many entries exist for this observer
    observer_entries = [obs for obs in observers if obs['KK'] == kk]
    
    if len(observer_entries) <= 1:
        return jsonify({'error': 'cannot_delete_last_site', 'kk': kk}), 400
    
    # Delete the entry
    try:
        if is_cloud_mode():
            # Cloud Mode: Direct SQL DELETE
            success = observer_db.delete_one(kk, seit)
            if not success:
                return jsonify({'error': 'site_not_found', 'kk': kk, 'seit': seit}), 404
        else:
            # Local Mode: Filter out entry and save
            entry_found = False
            new_observers = []
            for obs in observers:
                if obs['KK'] == kk and obs['seit'] == seit:
                    entry_found = True
                    continue
                new_observers.append(obs)
            
            if not entry_found:
                return jsonify({'error': 'site_not_found', 'kk': kk, 'seit': seit}), 404
            
            new_observers = observer_logic.sort_observers(new_observers)
            observer_file.save_file(new_observers)
            current_app.config['OBSERVERS'] = new_observers
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': 'site_delete_failed', 'details': str(e)}), 500


@api_blueprint.route('/observers', methods=['DELETE'])
def delete_observer():
    """Delete all site entries for an observer"""
    
    # Get KK from request body
    data = request.get_json()
    if not data:
        return jsonify({'error': 'no_data_provided'}), 400
    
    kk = data.get('KK')
    if not kk:
        return jsonify({'error': 'kk_required'}), 400
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Cloud Mode: Authorization check - only own KK or admin
    auth_error = _check_cloud_write_auth(kk)
    if auth_error:
        return auth_error
    
    # Get observers based on deployment mode
    if is_cloud_mode():
        observers = observer_db.load_filtered(kk=kk)
    else:
        observers = current_app.config.get('OBSERVERS', [])
    
    # Find all entries for this observer
    observer_entries = [obs for obs in observers if obs['KK'] == kk]
    
    if not observer_entries:
        return jsonify({'error': 'observer_not_found', 'kk': kk}), 404
    
    # Delete all entries
    try:
        if is_cloud_mode():
            # Cloud Mode: Delete all entries for this KK
            deleted_count = 0
            for obs in observer_entries:
                seit = obs['seit']  # Cloud mode uses dict keys
                success = observer_db.delete_one(kk, seit)
                if success:
                    deleted_count += 1
            
            return jsonify({
                'success': True,
                'deleted_count': deleted_count
            })
        else:
            # Local Mode: Filter out all entries for this KK
            new_observers = [obs for obs in observers if obs['KK'] != kk]
            new_observers = observer_logic.sort_observers(new_observers)
            observer_file.save_file(new_observers)
            current_app.config['OBSERVERS'] = new_observers
            
            return jsonify({
                'success': True,
                'deleted_count': len(observer_entries)
            })
    except Exception as e:
        return jsonify({'error': 'observer_delete_failed', 'details': str(e)}), 500
