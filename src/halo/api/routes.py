"""REST API routes for HALO web application.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

# Standard library imports
import calendar
import csv
import io
import json
import math
import os
import shutil
import tempfile
import traceback
from collections import Counter, defaultdict
from datetime import datetime
from functools import cmp_to_key
from io import StringIO
from pathlib import Path
from typing import Dict, Any

# Third-party imports
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
from flask import Blueprint, jsonify, request, current_app, Response, session, g, send_file, make_response

# Project imports
from halo.config import is_cloud_mode, get_cloud_server_url
from halo.io.csv_handler import ObservationCSV
from halo.io.observers import load_observers, save_observers, find_observer_records, add_observer_record, update_observer_record, delete_observer_record
from halo.models.constants import COMBINED_TO_INDIVIDUAL_HALOS, DEFAULT_OBSERVATION_LIMIT, resolve_halo_type, calculate_halo_activity
from halo.models.types import Observation
from halo.resources import I18n, set_language as set_lang
from halo.resources.i18n import get_i18n
from halo.services.auth import AuthService
from halo.services.settings import Settings

# NEW CODE - Using io.observations + io.observations_file (Layer 2 + Layer 3a)
import halo.io.observations as obs_logic
import halo.io.observations_file as obs_file

api_blueprint = Blueprint('api', __name__, url_prefix='/api')


# ============================================================================
# Helper Functions
# ============================================================================
# Authentication API (Cloud Mode)
# ============================================================================

@api_blueprint.route('/login', methods=['POST'])
def login() -> Dict[str, Any]:
    """
    Authenticate user against AWS Parameter Store.
    
    Request body:
        {
            "username": "44" or "admin",
            "password": "password"
        }
    
    Response:
        {
            "success": true/false,
            "error": "error message" (if failed),
            "observer_kk": "44" (if regular user),
            "is_admin": true/false
        }
    """
    if not is_cloud_mode():
        return jsonify({'success': False, 'error': 'auth_not_required_local_mode'}), 400
    
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'username_password_required'}), 400
    
    # Verify credentials
    success, observer_kk = AuthService.verify_password(username, password)
    
    if success:
        # Set session variables
        session['authenticated'] = True
        session['username'] = username
        session['observer_kk'] = observer_kk  # None for admin, KK for regular users
        session['is_admin'] = (observer_kk is None)
        
        # Set FIXED_OBSERVER in app.config for regular users
        if observer_kk:
            current_app.config['FIXED_OBSERVER'] = observer_kk
        
        return jsonify({
            'success': True,
            'observer_kk': observer_kk,
            'is_admin': observer_kk is None
        })
    else:
        return jsonify({
            'success': False,
            'error': 'invalid_credentials'
        }), 401


@api_blueprint.route('/logout', methods=['POST'])
def logout_api() -> Dict[str, Any]:
    """Logout current user."""
    session.clear()
    return jsonify({'success': True})


@api_blueprint.route('/change-password', methods=['POST'])
def change_password() -> Dict[str, Any]:
    """
    Change user password in AWS Parameter Store.
    
    Regular user mode:
        {
            "current_password": "current",
            "new_password": "new"
        }
    
    Admin mode (admin setting password for any user):
        {
            "target_user": "44" or "admin",
            "new_password": "new",
            "admin_mode": true
        }
    
    Response:
        {
            "success": true/false,
            "error": "error message" (if failed)
        }
    """
    if not is_cloud_mode():
        return jsonify({'success': False, 'error': 'password_change_not_available_local'}), 400
    
    if not session.get('authenticated'):
        return jsonify({'success': False, 'error': 'not_authenticated'}), 401
    
    data = request.get_json()
    is_admin = session.get('is_admin', False)
    admin_mode = data.get('admin_mode', False)
    
    if admin_mode:
        # Admin setting password for any user
        if not is_admin:
            return jsonify({'success': False, 'error': 'admin_privileges_required'}), 403
        
        target_user = data.get('target_user', '')
        new_password = data.get('new_password', '')
        
        if not target_user or not new_password:
            return jsonify({'success': False, 'error': 'target_user_password_required'}), 400
        
        # Admin can set password without knowing current password
        success, error = AuthService.change_password(target_user, '', new_password, admin_bypass=True)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': error or 'password_change_failed'}), 400
    
    else:
        # Regular user changing own password
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not current_password or not new_password:
            return jsonify({'success': False, 'error': 'current_new_password_required'}), 400
        
        username = session.get('username')
        if not username:
            return jsonify({'success': False, 'error': 'session_error'}), 400
        
        # Change password with verification
        success, error = AuthService.change_password(username, current_password, new_password, admin_bypass=False)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'error': error or 'password_change_failed'}), 400


# ============================================================================
# Astronomical Calculations (translated from H_AUSW.PAS)
# ============================================================================

def calculate_solar_altitude(
    year: int, month: int, day: int, hour: int, minute: int, duration: int,
    longitude: float, latitude: float, altitude_type: str = 'mean', gg: int = 0
) -> int:
    """Calculate solar altitude (sun's elevation above horizon) in degrees."""
    jahr = 1900 + year
    if jahr < 1950:
        jahr = jahr + 100
    
    def calc_altitude_at_time(zeit):
        zeit = zeit % 24
        n = (math.trunc(275 / 9 * month) - 
             math.trunc((month + 9) / 12) * 
             (1 + math.trunc((jahr - 4 * math.trunc(jahr / 4) + 2) / 3)) + 
             day - 30)
        t = n + (zeit - longitude / 15.0) / 24.0
        m = 0.985600 * t - 3.289
        l = m + 1.916 * math.sin(m * math.pi / 180.0) + 0.020 * math.sin(2 * m * math.pi / 180.0) + 282.634
        l = l % 360
        al = 180 * math.atan(0.91746 * math.sin(l * math.pi / 180.0) / math.cos(l * math.pi / 180.0)) / math.pi
        if (l > 90) and (l < 270):
            al = al + 180
        de = 180 * math.asin(0.39782 * math.sin(l * math.pi / 180.0)) / math.pi
        if month > 2:
            jd = math.trunc(30.6001 * (month + 1)) + math.trunc(365.25 * jahr)
        else:
            jd = math.trunc(30.6001 * (month + 13)) + math.trunc(365.25 * (jahr - 1))
        jd = jd + 1720994.5 + 2 - math.trunc(jahr / 100) + math.trunc(jahr / 400) + day + zeit / 24.0
        t2 = (jd - 2451545) / 36525.0
        st0 = 6.697375 + 2400.051337 * t2 + 0.0000359 * t2 * t2
        st = st0 + longitude / 15.0 + 1.002737909 * (zeit - 1)
        sw = (15 * st - al) % 360
        altitude_rad = math.asin(
            math.sin(latitude * math.pi / 180.0) * math.sin(de * math.pi / 180.0) +
            math.cos(sw * math.pi / 180.0) * math.cos(de * math.pi / 180.0) * math.cos(latitude * math.pi / 180.0)
        )
        return altitude_rad / math.pi * 180.0
    
    time_start = hour + minute / 60.0
    if altitude_type == 'mean':
        time_mid = time_start + duration / 120.0
        altitude_deg = calc_altitude_at_time(time_mid)
    else:
        altitude_start = calc_altitude_at_time(time_start)
        time_end = time_start + duration / 60.0
        altitude_end = calc_altitude_at_time(time_end)
        altitude_deg = min(altitude_start, altitude_end) if altitude_type == 'min' else max(altitude_start, altitude_end)
    
    return round(altitude_deg)


def get_observer_coordinates(observer_record: dict, gg: int) -> tuple[float, float]:
    """Extract observer's latitude and longitude from observer record."""
    if gg == 0:
        lon_deg = int(observer_record.get('HLG', 0) or 0)
        lon_min = int(observer_record.get('HLM', 0) or 0)
        lon_ew = observer_record.get('HOW', 'O')
        lat_deg = int(observer_record.get('HBG', 0) or 0)
        lat_min = int(observer_record.get('HBM', 0) or 0)
        lat_ns = observer_record.get('HNS', 'N')
    elif gg == 2:
        lon_deg = int(observer_record.get('NLG', 0) or 0)
        lon_min = int(observer_record.get('NLM', 0) or 0)
        lon_ew = observer_record.get('NOW', 'O')
        lat_deg = int(observer_record.get('NBG', 0) or 0)
        lat_min = int(observer_record.get('NBM', 0) or 0)
        lat_ns = observer_record.get('NNS', 'N')
    else:
        return (0.0, 0.0)
    
    longitude = lon_deg + lon_min / 60.0
    if lon_ew == 'W':
        longitude = -longitude
    latitude = lat_deg + lat_min / 60.0
    if lat_ns == 'S':
        latitude = -latitude
    
    return longitude, latitude


def get_days_in_month(month: int, year: int) -> int:
    """Get number of days in a month, handling leap years.
    
    Args:
        month: Month (1-12)
        year: 2-digit year (0-99)
    
    Returns:
        Number of days in the month (28-31)
    """
    days_per_month = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    if month < 1 or month > 12:
        return 30  # Fallback
    
    days = days_per_month[month - 1]
    
    # Check for leap year in February
    if month == 2:
        # Convert 2-digit year to 4-digit
        full_year = year + 2000 if year < 50 else year + 1900
        # Simple leap year check (divisible by 4)
        if full_year % 4 == 0:
            days = 29
    
    return days


def _format_lp8(e: int, ho: int | None, hu: int | None) -> str:
    """Direct translation of Pascal Kurzausgabe for the 8HO/HU field.

    Pascal reference:
        IF E=8 THEN IF ho=-1 THEN '8////' ELSE '8' + HO + '//'
        ELSE IF E=9 THEN IF hu=-1 THEN '8////' ELSE '8//' + HU
        ELSE IF E=10 THEN '8' + (HO or '//') + (HU or '//')
        ELSE '/////'
    """
    # Treat None the same as -1 (unknown)
    ho_unknown = (ho is None) or (ho == -1)
    hu_unknown = (hu is None) or (hu == -1)

    if e == 8:
        if ho_unknown:
            return '8////'
        return '8' + f"{ho:02d}" + '//'
    elif e == 9:
        if hu_unknown:
            return '8////'
        return '8//' + f"{hu:02d}"
    elif e == 10:
        s = '8'
        s += '//' if ho_unknown else f"{ho:02d}"
        s += '//' if hu_unknown else f"{hu:02d}"
        return s
    else:
        return '/////'


@api_blueprint.route('/health', methods=['GET'])
def health_check() -> Dict[str, Any]:
    return jsonify({'status': 'ok', 'version': '3.0.2', 'service': 'HALO API'})


@api_blueprint.route('/language', methods=['GET'])
def get_language() -> Dict[str, Any]:
    """Get current language from session."""
    language = session.get('language', 'de')
    return jsonify({'language': language})


@api_blueprint.route('/language/<lang>', methods=['POST'])
def set_language(lang: str) -> Dict[str, Any]:
    """Set language in session and i18n system."""
    
    if lang not in ['de', 'en']:
        return jsonify({'error': 'invalid_language'}), 400
    
    # Update session
    session['language'] = lang
    
    # Update i18n instance
    set_lang(lang)
    
    return jsonify({'success': True, 'language': lang})


@api_blueprint.route('/i18n/<lang>', methods=['GET'])
def get_i18n_strings(lang: str) -> Dict[str, Any]:
    """Get all i18n strings for specified language."""
    
    try:
        i18n = I18n(lang)
        response = make_response(jsonify(i18n.strings))
        # Prevent browser caching - always fetch fresh i18n data
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    except FileNotFoundError:
        return jsonify({'error': f'Language {lang} not found'}), 404


@api_blueprint.route('/whats-new/<lang>', methods=['GET'])
def get_whats_new(lang: str) -> Dict[str, Any]:
    # Resources are at project root level
    resources_dir = Path(__file__).parent.parent.parent.parent / 'resources'

    # Prefer language-specific .md, then generic .md (no .txt fallback)
    candidates = [
        resources_dir / f'whats_new_{lang}.md',
        resources_dir / 'whats_new.md',
    ]

    whats_new_file = next((p for p in candidates if p.exists()), None)
    if not whats_new_file:
        return jsonify({'error': "What's New file not found"}), 404

    try:
        with open(whats_new_file, 'r', encoding='utf-8') as f:
            content = f.read()

        fmt = 'markdown' if whats_new_file.suffix.lower() == '.md' else 'text'
        return jsonify({'language': lang, 'content': content, 'format': fmt})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/help/<lang>', methods=['GET'])
def get_help(lang: str) -> Dict[str, Any]:
    # Resources are at project root level
    resources_dir = Path(__file__).parent.parent.parent.parent / 'resources'

    # Prefer language-specific .md, then generic .md
    candidates = [
        resources_dir / f'help_{lang}.md',
        resources_dir / 'help.md',
    ]

    help_file = next((p for p in candidates if p.exists()), None)
    if not help_file:
        return jsonify({'error': "Help file not found"}), 404

    try:
        with open(help_file, 'r', encoding='utf-8') as f:
            content = f.read()

        fmt = 'markdown' if help_file.suffix.lower() == '.md' else 'text'
        return jsonify({'language': lang, 'content': content, 'format': fmt})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations', methods=['GET'])
def get_observations() -> Dict[str, Any]:
    """
    Get observations from the currently loaded file (in memory) with optional pagination.

    Query parameters:
    - limit: Maximum number of results (default from constants.DEFAULT_OBSERVATION_LIMIT, <=0 returns all)
    - offset: Pagination offset (default 0)
    """
    limit = int(request.args.get('limit', DEFAULT_OBSERVATION_LIMIT))
    offset = int(request.args.get('offset', 0))

    # Get in-memory data loaded via /file/upload or /file/load
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
        'observations': [
            {
                'KK': obs.KK if obs.KK != -1 else None,
                'O': obs.O if obs.O != -1 else None,
                'JJ': obs.JJ if obs.JJ != -1 else None,
                'MM': obs.MM if obs.MM != -1 else None,
                'TT': obs.TT if obs.TT != -1 else None,
                'GG': obs.GG if obs.GG != -1 else None,
                'ZS': obs.ZS if obs.ZS != -1 else None,
                'ZM': obs.ZM if obs.ZM != -1 else None,
                'd': obs.d if obs.d != -1 else None,
                'DD': obs.DD if obs.DD != -1 else None,
                'N': obs.N if obs.N != -1 else None,
                'C': obs.C if obs.C != -1 else None,
                'c': obs.c if obs.c != -1 else None,
                'EE': obs.EE if obs.EE != -1 else None,
                'H': obs.H if obs.H != -1 else None,
                'F': obs.F if obs.F != -1 else None,
                'V': obs.V if obs.V != -1 else None,
                'f': obs.f if obs.f != -1 else None,
                'zz': obs.zz if obs.zz not in (-1, 99) else (0 if obs.zz == 99 else None),
                'g': obs.g if obs.g != -1 else None,
                'HO': obs.HO if obs.HO != -1 else None,
                'HU': obs.HU if obs.HU != -1 else None,
                # Precomputed light pillar field using Pascal's exact logic
                'lp8': _format_lp8(obs.EE, obs.HO if obs.HO != -1 else None, obs.HU if obs.HU != -1 else None),
                'sectors': getattr(obs, 'sectors', ''),
                'remarks': getattr(obs, 'remarks', ''),
            }
            for obs in paginated
        ],
    }

    return jsonify(result)


def _spaeter(a, b) -> int:
    """Compare two observations for sort order.
    
    Pascal function spaeter() translation.
    Sort criteria: J → M → T → ZS → ZM → K → E → gg
    
    Returns:
        -1 if a comes before b
         0 if a and b are equal (same position)
         1 if a comes after b
    """
    spt = -1
    
    # Year comparison with century wrap (50 = cutoff for 1950/2050)
    hilf = (((a.JJ > b.JJ) and not ((a.JJ >= 50) and (b.JJ < 50))) or
            ((a.JJ < 50) and (b.JJ >= 50)))
    
    if a.JJ == b.JJ:
        hilf = a.MM > b.MM
        if a.MM == b.MM:
            hilf = a.TT > b.TT
            if a.TT == b.TT:
                hilf = a.ZS > b.ZS
                if a.ZS == b.ZS:
                    hilf = a.ZM > b.ZM
                    if a.ZM == b.ZM:
                        hilf = a.KK > b.KK
                        if a.KK == b.KK:
                            hilf = a.EE > b.EE
                            if a.EE == b.EE:
                                hilf = a.GG > b.GG
                                if a.GG == b.GG:
                                    spt = 0
    
    if hilf:
        spt = 1
    
    return spt


@api_blueprint.route('/observations', methods=['POST'])
def add_observation() -> Dict[str, Any]:
    """Add a new observation to the in-memory list at the correct sorted position (Zahleneingabe)."""
    
    data = request.get_json() or {}

    # Minimal validation
    required_fields = ['KK','O','JJ','MM','TT','GG','EE','g']
    for f in required_fields:
        if f not in data:
            return jsonify({'error': f'Missing field: {f}'}), 400

    try:
        obs = Observation()
        # Assign fields with defaults for unknowns
        for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
            if field in data and data[field] is not None:
                setattr(obs, field, int(data[field]))
        obs.sectors = data.get('sectors', '') or ''
        obs.remarks = data.get('remarks', '') or ''

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

        return jsonify({'success': True, 'count': len(observations)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@api_blueprint.route('/observations/delete', methods=['POST'])
def delete_observation() -> Dict[str, Any]:
    """Delete an observation by matching its field values."""
    data = request.get_json() or {}

    try:
        observations = current_app.config.get('OBSERVATIONS') or []
        
        # Find observation to delete by matching key fields
        # Match by: KK, O, JJ, MM, TT, EE, GG (unique identifier)
        original_obs = None
        for i, obs in enumerate(observations):
            if (obs.KK == data.get('KK') and
                obs.O == data.get('O') and
                obs.JJ == data.get('JJ') and
                obs.MM == data.get('MM') and
                obs.TT == data.get('TT') and
                obs.EE == data.get('EE') and
                obs.GG == data.get('GG')):
                original_obs = i
                break
        
        if original_obs is not None:
            observations.pop(original_obs)
            current_app.config['OBSERVATIONS'] = observations
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
    
    # Convert observation dicts to Observation objects
    observations = []
    for obs_dict in observations_data:
        obs = Observation()
        for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
            if field in obs_dict and obs_dict[field] is not None:
                setattr(obs, field, obs_dict[field])
        obs.sectors = obs_dict.get('sectors', '') or ''
        obs.remarks = obs_dict.get('remarks', '') or ''
        observations.append(obs)
    
    current_app.config['OBSERVATIONS'] = observations
    
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
    
    # Convert observation dicts to Observation objects
    observations = []
    for obs_dict in observations_data:
        obs = Observation()
        for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
            if field in obs_dict and obs_dict[field] is not None:
                setattr(obs, field, obs_dict[field])
        obs.sectors = obs_dict.get('sectors', '') or ''
        obs.remarks = obs_dict.get('remarks', '') or ''
        observations.append(obs)
    
    # Write to file
    filepath = obs_file.get_data_path(filename)
    
    # Check if file exists
    if filepath.exists() and not overwrite:
        return jsonify({'success': False, 'exists': True, 'filename': filename}), 200
    
    try:
        obs_file.save_file(filename, observations)
        
        return jsonify({
            'success': True,
            'filename': filename,
            'count': len(observations)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observations/filter', methods=['POST'])
def filter_observations() -> Dict[str, Any]:
    """
    Filter observations server-side for Datei -> Selektieren.
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
        - filtered_observations: List of filtered observation objects
        - kept_count: Number of observations kept
        - deleted_count: Number of observations deleted
    """
    
    try:
        params = request.get_json()
        filter_type = params.get('filter_type')
        action = params.get('action', 'keep')
        
        # Load current observations from session
        observations = current_app.config.get('OBSERVATIONS', [])
        if not observations:
            return jsonify({'error': 'no_observations_loaded'}), 400
        
        # Load observers for SH filtering (already loaded in app config)
        observers_list = current_app.config.get('OBSERVERS', [])
        
        # Filter observations based on type
        matching_obs = []
        
        if filter_type == 'KK':
            value = int(params.get('value'))
            matching_obs = [obs for obs in observations if obs.KK == value]
            
        elif filter_type == 'MM':
            month = int(params.get('month'))
            year = int(params.get('year'))
            year_2digit = year % 100  # Convert to 2-digit
            matching_obs = [obs for obs in observations if obs.MM == month and obs.JJ == year_2digit]
            
        elif filter_type == 'TT':
            day = int(params.get('day'))
            month = int(params.get('month'))
            year = int(params.get('year'))
            year_2digit = year % 100  # Convert to 2-digit
            matching_obs = [obs for obs in observations if obs.TT == day and obs.MM == month and obs.JJ == year_2digit]
            
        elif filter_type == 'ZZ':
            from_hour = int(params.get('from_hour'))
            from_minute = int(params.get('from_minute'))
            to_hour = int(params.get('to_hour'))
            to_minute = int(params.get('to_minute'))
            from_time = from_hour * 60 + from_minute
            to_time = to_hour * 60 + to_minute
            for obs in observations:
                if obs.ZS is not None and obs.ZS != -1 and obs.ZM is not None and obs.ZM != -1:
                    obs_time = obs.ZS * 60 + obs.ZM
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
            # Year - convert 4-digit to 2-digit
            value = int(params.get('value'))
            year_2digit = value % 100
            matching_obs = [obs for obs in observations if obs.JJ == year_2digit]
                    
        else:
            # Simple value match for other parameters (GG, O, EE, DD, N, C, H, F, V)
            value = int(params.get('value'))
            attr = filter_type
            for obs in observations:
                obs_value = getattr(obs, attr, None)
                if obs_value == value:
                    matching_obs.append(obs)
        
        # Apply action (keep or delete)
        if action == 'keep':
            filtered_obs = matching_obs
        else:  # action == 'delete'
            filtered_obs = [obs for obs in observations if obs not in matching_obs]
        
        kept_count = len(filtered_obs)
        deleted_count = len(observations) - kept_count
        
        # Convert observations to dicts for JSON response
        filtered_dicts = []
        for obs in filtered_obs:
            obs_dict = {
                'KK': obs.KK, 'O': obs.O, 'JJ': obs.JJ, 'MM': obs.MM, 'TT': obs.TT,
                'g': obs.g, 'ZS': obs.ZS, 'ZM': obs.ZM, 'd': obs.d,
                'DD': obs.DD, 'N': obs.N, 'C': obs.C, 'c': obs.c,
                'EE': obs.EE, 'GG': obs.GG, 'H': obs.H, 'F': obs.F, 'V': obs.V,
                'f': obs.f, 'zz': obs.zz, 'HO': obs.HO, 'HU': obs.HU,
                'SE': obs.sectors, 'Bem': obs.remarks
            }
            filtered_dicts.append(obs_dict)
        
        return jsonify({
            'success': True,
            'filtered_observations': filtered_dicts,
            'kept_count': kept_count,
            'deleted_count': deleted_count
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/statistics', methods=['GET'])
def get_statistics() -> Dict[str, Any]:
    """
    Get database statistics.
    
    Returns:
        JSON object with:
        - total_observations
        - date_range
        - observers_count
        - halo_types_distribution
        - regions_distribution
    """
    
    csv_handler = ObservationCSV()
    data_path = Path(__file__).parent.parent.parent.parent / 'data' / 'ALLE.CSV'
    
    try:
        observations, needs_conversion = csv_handler.read_observations(str(data_path))
        # Auto-convert legacy format
        if needs_conversion:
            csv_handler.write_observations(data_path, observations)
        
        # Calculate statistics
        years = [obs.JJ for obs in observations]
        halo_types = Counter(obs.EE for obs in observations)
        regions = Counter(obs.GG for obs in observations)
        observers = set(obs.KK for obs in observations)
        
        result = {
            'total_observations': len(observations),
            'date_range': {
                'start': min(years) if years else None,
                'end': max(years) if years else None
            },
            'observers_count': len(observers),
            'top_halo_types': dict(halo_types.most_common(10)),
        }
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/files', methods=['GET'])
def list_files() -> Dict[str, Any]:
    """List available .HAL and .CSV files in data directory"""
    datapath = Path(__file__).parent.parent.parent.parent / 'data'
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
    
    datapath = Path(__file__).parent.parent.parent.parent / 'data'
    filepath = os.path.join(str(datapath), filename)
    
    if os.path.exists(filepath):
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
            observations, _ = obs_file.open_file(temp_filename)  # Returns (observations, filepath)
            obs_file.delete_file(temp_filename)  # Clean up after loading
            
            # Store in app config
            current_app.config['LOADED_FILE'] = file.filename
            current_app.config['OBSERVATIONS'] = observations
            current_app.config['DIRTY'] = False  # File just loaded, no changes yet
            
            return jsonify({
                'success': True,
                'filename': file.filename,
                'count': len(observations),
                'message': f'{len(observations)} Beobachtungen geladen!',
                'converted': False
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
        
        # Create a set of existing observation keys for duplicate detection
        # Key format: KK-O-JJ-MM-TT-EE-GG (matches observation unique identifier)
        existing_keys = set()
        for obs in current_observations:
            key = f"{obs.KK}-{obs.O}-{obs.JJ:02d}-{obs.MM:02d}-{obs.TT:02d}-{obs.EE:02d}-{obs.GG:02d}"
            existing_keys.add(key)
        
        # Add observations from new file that don't already exist
        added_count = 0
        for obs in new_observations:
            key = f"{obs.KK}-{obs.O}-{obs.JJ:02d}-{obs.MM:02d}-{obs.TT:02d}-{obs.EE:02d}-{obs.GG:02d}"
            if key not in existing_keys:
                current_observations.append(obs)
                existing_keys.add(key)
                added_count += 1
        
        # Sort observations using spaeter() equivalent
        current_observations = sorted(current_observations, key=cmp_to_key(_spaeter))
        
        # Update app config
        current_app.config['OBSERVATIONS'] = current_observations
        # Mark as dirty only if at least one observation was added
        
        return jsonify({
            'success': True,
            'added_count': added_count,
            'total_count': len(current_observations)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/load/<filename>', methods=['GET', 'POST'])
def load_file(filename: str) -> Dict[str, Any]:
    """Load observation file from data folder - implements 'Datei -> Laden' from HALO.PAS laden()
    
    Supports both GET and POST methods for convenience.
    """
    datapath = Path(__file__).parent.parent.parent.parent / 'data'
    filepath = datapath / filename
    
    if not filepath.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        observations = obs_file.open_file(filename)
        
        # Store in app config
        current_app.config['LOADED_FILE'] = filename
        current_app.config['OBSERVATIONS'] = observations
        current_app.config['DIRTY'] = False
        
        return jsonify({
            'success': True,
            'filename': filename,
            'count': len(observations),
            'converted': False  # obs_file.open_file() handles legacy conversion internally
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/save', methods=['POST'])
def save_file() -> Dict[str, Any]:
    """Save current observations to disk - triggers browser download"""
    filename = current_app.config.get('LOADED_FILE')
    if not filename:
        return jsonify({'error': 'No file loaded'}), 400
    
    observations = current_app.config.get('OBSERVATIONS', [])
    
    try:
        datapath = Path(__file__).parent.parent.parent.parent / 'data'
        filepath = datapath / filename
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
def upload_file() -> Dict[str, Any]:
    """
    Upload observations to cloud server (all.csv).
    
    Request body:
        {
            "observerKK": "44",
            "password": "password",
            "observations": [...],
            "mode": "add" or "replace"
        }
    
    Modes:
        - add: Add observations to existing all.csv
        - replace: Delete all observations of this observer first, then add new ones
    """
    
    data = request.get_json()
    observer_kk = data.get('observerKK')
    password = data.get('password', '')
    new_observations_data = data.get('observations', [])
    mode = data.get('mode', 'add')  # 'add' or 'replace'
    use_session = data.get('use_session', False)  # Use session authentication
    
    if not observer_kk:
        return jsonify({'error': 'observer_kk_required'}), 400
    
    if not new_observations_data:
        return jsonify({'error': 'no_observations_to_upload'}), 400
    
    # Authenticate user
    is_admin = False
    if use_session:
        # Use session authentication (cloud mode - already logged in)
        if not session.get('authenticated', False):
            return jsonify({'error': 'Not authenticated'}), 401
        
        # Check if user is admin
        is_admin = session.get('is_admin', False)
        
        # Verify that session user matches requested observerKK (unless admin)
        if not is_admin:
            session_kk = session.get('observer_kk', '')
            if str(session_kk) != str(observer_kk):
                return jsonify({'error': 'Cannot upload observations for different observer'}), 403
    else:
        # Use password authentication (local mode)
        if not password:
            return jsonify({'error': 'Password required'}), 400
        
        auth_service = AuthService()
        is_valid, user_info = auth_service.verify_password(observer_kk, password)
        
        if not is_valid:
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Check if authenticated user is admin
        is_admin = user_info.get('is_admin', False)
    
    try:
        # Convert observation dicts to Observation objects
        # SECURITY: Filter to only include observations matching the authenticated user's KK
        # EXCEPTION: Admin can upload observations for any observer
        new_observations = []
        filtered_out_count = 0
        for obs_dict in new_observations_data:
            # Admin can upload all observations, regular users only their own
            if not is_admin and str(obs_dict.get('KK')) != str(observer_kk):
                filtered_out_count += 1
                continue
            
            obs = Observation()
            for field in ['KK','O','JJ','MM','TT','GG','ZS','ZM','DD','d','N','C','c','EE','H','F','V','f','zz','g','HO','HU']:
                if field in obs_dict and obs_dict[field] is not None:
                    setattr(obs, field, obs_dict[field])
            obs.sectors = obs_dict.get('sectors', '') or ''
            obs.remarks = obs_dict.get('remarks', '') or ''
            new_observations.append(obs)
        
        # Check if any observations remain after filtering
        if not new_observations:
            return jsonify({
                'error': 'No valid observations to upload (all observations filtered out)',
                'filtered_out': filtered_out_count
            }), 400
        
        # Load current observations from all.csv
        current_observations = current_app.config.get('OBSERVATIONS', [])
        
        if mode == 'replace':
            # Delete all observations of this observer
            current_observations = [
                obs for obs in current_observations 
                if str(obs.KK) != str(observer_kk)
            ]
        
        # Add new observations (avoiding duplicates)
        existing_keys = set()
        for obs in current_observations:
            key = f"{obs.KK}-{obs.O}-{obs.JJ:02d}-{obs.MM:02d}-{obs.TT:02d}-{obs.EE:02d}-{obs.GG:02d}"
            existing_keys.add(key)
        
        added_count = 0
        for obs in new_observations:
            key = f"{obs.KK}-{obs.O}-{obs.JJ:02d}-{obs.MM:02d}-{obs.TT:02d}-{obs.EE:02d}-{obs.GG:02d}"
            if key not in existing_keys:
                current_observations.append(obs)
                existing_keys.add(key)
                added_count += 1
        
        # Sort observations using spaeter()
        current_observations = sorted(current_observations, key=cmp_to_key(_spaeter))
        
        # Update config and save
        current_app.config['OBSERVATIONS'] = current_observations
        
        return jsonify({
            'success': True,
            'count': added_count,
            'total_count': len(current_observations),
            'mode': mode
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/download', methods=['POST'])
def download_file() -> Dict[str, Any]:
    """Download filtered observations as CSV file - implements 'Datei -> Download'
    
    Supports two authentication modes:
    1. Session-based (cloud mode): user authenticated via session
    2. Password-based (local mode): user provides credentials
    
    Filters observations by user's KK unless user is admin.
    Returns CSV content for client-side file save dialog.
    """
    
    data = request.get_json()
    observer_kk = data.get('observerKK')  # KK number or "Admin"
    password = data.get('password', '')  # Only for local mode
    use_session = data.get('use_session', False)  # True for cloud mode
    download_all = data.get('download_all', False)  # True to bypass KK filter
    
    # Validate parameters
    if not observer_kk:
        return jsonify({'error': 'observer_kk_missing'}), 400
    
    try:
        # Determine if user is admin and get authenticated KK
        is_admin = False
        authenticated_kk = None
        
        if use_session:
            # Cloud mode: authenticate via session
            authenticated_kk = session.get('observer_kk')
            is_admin = session.get('is_admin', False)
            
            if not authenticated_kk:
                return jsonify({'error': 'not_authenticated'}), 401
        else:
            # Local mode: authenticate via password
            if observer_kk.upper() == 'ADMIN':
                # Admin authentication
                is_valid, user_info = AuthService.verify_password('admin', password)
                if not is_valid:
                    return jsonify({'error': 'invalid_admin_credentials'}), 401
                is_admin = True
                authenticated_kk = None  # Admin has no specific KK
            else:
                # Regular user authentication
                is_valid, user_info = AuthService.verify_password(observer_kk, password)
                if not is_valid:
                    return jsonify({'error': 'invalid_credentials'}), 401
                authenticated_kk = int(observer_kk)
                is_admin = False
        
        # Load all.csv observations (Cloud mode only)
        root_path = Path(current_app.root_path).parent.parent
        all_csv_path = root_path / 'data' / 'all.csv'
        
        if not all_csv_path.exists():
            return jsonify({'error': 'all_csv_not_found'}), 404
        
        # Using io.observations_file
        all_observations, _ = obs_file.open_file(str(all_csv_path))
        
        # Filter observations by KK (unless admin or download_all requested)
        if is_admin or download_all:
            # Admin or user requested all observations
            filtered_observations = all_observations
        else:
            # Regular user gets only their own observations
            filtered_observations = [
                obs for obs in all_observations
                if str(obs.KK) == str(authenticated_kk)
            ]
        
        if not filtered_observations:
            return jsonify({'error': 'no_observations'}), 404
        
        # Generate CSV content
        csv_buffer = io.StringIO()
        obs_file.export_observations_to_csv(filtered_observations, csv_buffer)
        csv_content = csv_buffer.getvalue()
        
        # Return CSV content for client-side download
        return jsonify({
            'success': True,
            'csv_content': csv_content,
            'count': len(filtered_observations),
            'observer_kk': authenticated_kk,
            'is_admin': is_admin
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        #     observations = result.get('observations', [])
        #     
        #     # Store in app config
        #     current_app.config['OBSERVATIONS'] = observations
        #     current_app.config['LOADED_FILE'] = filename
        #     current_app.config['DIRTY'] = True
        #     
        #     return jsonify({
        #         'success': True,
        #         'filename': filename,
        #         'count': len(observations),
        #         'observations': observations,
        #         'message': f'Downloaded {len(observations)} observations'
        #     })
        # else:
        #     return jsonify({'error': f'Download failed with status {response.status_code}'}), 500
        
        # Placeholder response (remove when implementing actual download)
        # For now, return empty observations list
        observations = []
        
        current_app.config['OBSERVATIONS'] = observations
        current_app.config['LOADED_FILE'] = filename
        
        return jsonify({
            'success': True,
            'filename': filename,
            'count': len(observations),
            'observations': observations
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/status', methods=['GET'])
def file_status() -> Dict[str, Any]:
    """Get current file status (loaded file, dirty state)"""
    
    
    auto_loaded = current_app.config.get('AUTO_LOADED', False)
    # Clear the flag after first check
    if auto_loaded:
        current_app.config['AUTO_LOADED'] = False
    
    return jsonify({
        'filename': current_app.config.get('LOADED_FILE'),
        'dirty': current_app.config.get('DIRTY', False),
        'count': len(current_app.config.get('OBSERVATIONS', [])),
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
    """Auto-save current observations to .$$$ temp file"""
    
    
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


@api_blueprint.route('/observers/upload', methods=['POST'])
def upload_observers() -> Dict[str, Any]:
    """Upload observer data to server - replaces existing data
    
    Supports two authentication modes:
    1. Session-based (cloud mode): user authenticated via session
    2. Password-based (local mode): user provides credentials
    
    Admin can upload all observers, regular users only their own.
    """
    
    data = request.get_json()
    observer_kk = data.get('observerKK')
    password = data.get('password', '')
    observers = data.get('observers', [])
    use_session = data.get('use_session', False)
    
    # Validate parameters
    if not observers:
        return jsonify({'error': 'no_observer_data_to_upload'}), 400
    
    try:
        # Determine if user is admin and get authenticated KK
        is_admin = False
        authenticated_kk = None
        
        if use_session:
            # Cloud mode: authenticate via session
            authenticated_kk = session.get('observer_kk')
            is_admin = session.get('is_admin', False)
            
            if not authenticated_kk and not is_admin:
                return jsonify({'error': 'not_authenticated'}), 401
        else:
            # Local mode: authenticate via password
            if not observer_kk:
                return jsonify({'error': 'observer_kk_missing'}), 400
            
            auth_service = AuthService()
            
            if observer_kk.upper() == 'ADMIN':
                # Admin authentication
                is_valid, user_info = auth_service.verify_password('admin', password)
                if not is_valid:
                    return jsonify({'error': 'invalid_admin_credentials'}), 401
                is_admin = user_info.get('is_admin', False)
            else:
                # Regular user authentication
                is_valid, user_info = auth_service.verify_password(observer_kk, password)
                if not is_valid:
                    return jsonify({'error': 'invalid_credentials'}), 401
                authenticated_kk = int(observer_kk)
                is_admin = user_info.get('is_admin', False)
        
        # Validate KK matches (unless admin)
        if not is_admin and authenticated_kk:
            for obs_record in observers:
                if len(obs_record) >= 1 and obs_record[0] != str(authenticated_kk):
                    return jsonify({'error': 'observer_kk_mismatch', 'details': {'expected': authenticated_kk, 'found': obs_record[0]}}), 403
        
        # Load existing observers
        existing_observers = load_observers()
        
        # Replace mode: Remove all existing records for uploaded observers
        uploaded_kks = set()
        for obs_record in observers:
            if len(obs_record) >= 1:
                uploaded_kks.add(obs_record[0])
        
        # Keep only observers NOT in the upload
        filtered_observers = [obs for obs in existing_observers if obs[0] not in uploaded_kks]
        
        # Add new observers
        filtered_observers.extend(observers)
        
        # Save and update app config
        save_observers(filtered_observers)
        current_app.config['OBSERVERS'] = filtered_observers
        
        return jsonify({
            'success': True,
            'count': len(observers),
            'total_count': len(filtered_observers)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/observers/download', methods=['POST'])
def download_observers() -> Dict[str, Any]:
    """Download complete observer data as CSV file (no KK filter)
    
    Returns the complete halobeo.csv so it can be used locally.
    
    Supports two modes:
    1. Session-based (cloud mode): user authenticated via session
    2. No auth (local mode): no authentication required for download
    """
    
    data = request.get_json()
    use_session = data.get('use_session', False)
    no_auth = data.get('no_auth', False)
    
    try:
        # Authentication check (only for cloud mode)
        if use_session:
            authenticated_kk = session.get('observer_kk')
            is_admin = session.get('is_admin', False)
            
            if not authenticated_kk and not is_admin:
                return jsonify({'error': 'Nicht authentifiziert. Bitte neu anmelden.'}), 401
        
        # Load observers
        all_observers = load_observers()
        
        if not all_observers:
            return jsonify({'error': 'no_observers'}), 404
        
        # No KK filter - return complete halobeo.csv
        # This allows the file to be used locally
        
        # Generate CSV content
        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerows(all_observers)
        csv_content = csv_buffer.getvalue()
        
        # Return CSV content for client-side download
        return jsonify({
            'success': True,
            'csv_content': csv_content,
            'count': len(all_observers)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@api_blueprint.route('/file/autosave_old', methods=['POST'])
def autosave_old() -> Dict[str, Any]:
    """Auto-save current observations to .$$$ temp file - OLD VERSION"""
    
    filename = current_app.config.get('LOADED_FILE')
    if not filename:
        return jsonify({'error': 'No file loaded'}), 400
    
    observations = current_app.config.get('OBSERVATIONS', [])
    if not observations:
        return jsonify({'error': 'No observations to save'}), 400
    
    # Create temp filename with .$$$ extension
    base_name = os.path.splitext(filename)[0]
    temp_filename = f"{base_name}.$$$"
    
    datapath = Path(__file__).parent.parent.parent.parent / 'data'
    temp_filepath = datapath / temp_filename
    
    try:
        obs_file.create_temp_backup(temp_filename, observations)
        
        return jsonify({
            'success': True,
            'temp_file': temp_filename,
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
    """Restore observations from .$$$ autosave file"""
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


@api_blueprint.route('/constants', methods=['GET'])
def get_constants():
    """Get application constants for frontend use"""
    from halo.models.constants import (
        GEOGRAPHIC_REGIONS,
        CIRCULAR_HALOS,
        COMBINED_TO_INDIVIDUAL_HALOS,
        HALO_TYPE_FACTORS,
        HALO_BRIGHTNESS_FACTORS,
        DEFAULT_OBSERVATION_LIMIT,
        PILLAR_HEIGHT_VALUES,
        ALL_PILLAR_HEIGHT_VALUES
    )
    
    return jsonify({
        'geographic_regions': GEOGRAPHIC_REGIONS,
        'circular_halos': list(CIRCULAR_HALOS),
        'combined_to_individual_halos': COMBINED_TO_INDIVIDUAL_HALOS,
        'halo_type_factors': HALO_TYPE_FACTORS,
        'halo_brightness_factors': HALO_BRIGHTNESS_FACTORS,
        'default_observation_limit': DEFAULT_OBSERVATION_LIMIT,
        'pillar_height_values': PILLAR_HEIGHT_VALUES,
        'all_pillar_height_values': ALL_PILLAR_HEIGHT_VALUES
    })


@api_blueprint.route('/config', methods=['GET'])
def get_config() -> Dict[str, Any]:
    """Get configuration including cloud mode and admin status."""
    return jsonify({
        'cloud_mode': is_cloud_mode(),
        'cloud_server_url': get_cloud_server_url(),
        'is_admin': session.get('is_admin', False),
        'authenticated': session.get('authenticated', False),
        'username': session.get('username')
    })


@api_blueprint.route('/config/inputmode', methods=['GET', 'POST'])
def inputmode() -> Dict[str, Any]:
    """Get or set Eingabeart (input mode) - implements 'Einstellungen -> Eingabeart' from H_BEOBNG.PAS"""
    if request.method == 'POST':
        data = request.get_json()
        mode = data.get('mode', 'N')
        
        if mode not in ['M', 'N']:
            return jsonify({'error': 'Invalid mode. Must be M or N'}), 400
        
        current_app.config['INPUT_MODE'] = mode
        # Persist setting
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'INPUT_MODE', mode)
        
        return jsonify({
            'success': True,
            'mode': mode,
            'display': 'lang' if mode == 'M' else 'kurz'
        })
    else:
        mode = current_app.config.get('INPUT_MODE', 'N')
        return jsonify({
            'mode': mode,
            'display': 'lang' if mode == 'M' else 'kurz'
        })


@api_blueprint.route('/config/outputmode', methods=['GET', 'POST'])
def outputmode() -> Dict[str, Any]:
    """Get or set Ausgabeart (output format) - NEW FEATURE not in original software"""
    if request.method == 'POST':
        data = request.get_json()
        mode = data.get('mode', 'P')
        
        if mode not in ['H', 'P', 'M']:
            return jsonify({'error': 'Invalid mode. Must be H, P, or M'}), 400
        
        current_app.config['OUTPUT_MODE'] = mode
        # Persist setting
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'OUTPUT_MODE', mode)
        
        display_map = {
            'H': 'HTML-Tabellen',
            'P': 'Pseudografik',
            'M': 'Markdown'
        }
        
        return jsonify({
            'success': True,
            'mode': mode,
            'display': display_map.get(mode, 'Pseudografik')
        })
    else:
        mode = current_app.config.get('OUTPUT_MODE', 'P')
        display_map = {
            'H': 'HTML-Tabellen',
            'P': 'Pseudografik',
            'M': 'Markdown'
        }
        return jsonify({
            'mode': mode,
            'display': display_map.get(mode, 'Pseudografik')
        })


@api_blueprint.route('/config/datedefault', methods=['GET', 'POST'])
def datedefault() -> Dict[str, Any]:
    """Get or set date default (Datumsvoreinstellung) - NEW FEATURE"""
    
    if request.method == 'POST':
        data = request.get_json()
        mode = data.get('mode', 'none')
        month = data.get('month', 1)
        year = data.get('year', 2026)
        
        if mode not in ['none', 'current', 'previous', 'constant']:
            return jsonify({'error': 'Invalid mode. Must be none, current, previous, or constant'}), 400
        
        current_app.config['DATE_DEFAULT_MODE'] = mode
        current_app.config['DATE_DEFAULT_MONTH'] = month
        current_app.config['DATE_DEFAULT_YEAR'] = year
        
        # Persist settings
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_from(current_app.config, root_path)
        
        return jsonify({
            'success': True,
            'mode': mode,
            'month': month,
            'year': year
        })
    else:
        mode = current_app.config.get('DATE_DEFAULT_MODE', 'none')
        month = current_app.config.get('DATE_DEFAULT_MONTH', 1)
        year = current_app.config.get('DATE_DEFAULT_YEAR', 2026)
        return jsonify({
            'mode': mode,
            'month': month,
            'year': year
        })


@api_blueprint.route('/config/fixed_observer', methods=['GET', 'POST'])
def fixed_observer() -> Dict[str, Any]:
    """Get or set fixed observer (fester Beobachter)"""
    if request.method == 'POST':
        # In cloud mode, fixed observer cannot be changed via API
        if is_cloud_mode():
            return jsonify({
                'success': False,
                'error': 'fixed_observer_cloud_mode_locked'
            }), 403
        
        data = request.get_json()
        observer = data.get('observer', '')
        
        current_app.config['FIXED_OBSERVER'] = observer
        # Persist setting
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'FIXED_OBSERVER', observer)
        
        return jsonify({
            'success': True,
            'observer': observer
        })
    else:
        observer = current_app.config.get('FIXED_OBSERVER', '')
        return jsonify({
            'observer': observer,
            'cloud_mode': is_cloud_mode(),
            'editable': not is_cloud_mode()
        })


@api_blueprint.route('/config/upload_password', methods=['GET', 'POST'])
def upload_password() -> Dict[str, Any]:
    """Get or set upload password (obfuscated)."""
    
    if request.method == 'POST':
        data = request.get_json()
        password = data.get('password', '')
        
        # Obfuscate password before storing
        obfuscated = Settings.obfuscate(password) if password else ''
        
        current_app.config['UPLOAD_PASSWORD'] = obfuscated
        # Persist setting
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'UPLOAD_PASSWORD', obfuscated)
        
        return jsonify({
            'success': True
        })
    else:
        # Get obfuscated password and deobfuscate it
        obfuscated = current_app.config.get('UPLOAD_PASSWORD', '')
        password = Settings.deobfuscate(obfuscated) if obfuscated else ''
        return jsonify({
            'password': password
        })


@api_blueprint.route('/config/active_observers', methods=['GET', 'POST'])
def active_observers_setting() -> Dict[str, Any]:
    """Get or set the 'aktive Beobachter' setting.

    This setting controls whether only active observers should be considered.
    As requested, this setting does not change current observers or observations menus behavior.
    """

    if request.method == 'POST':
        data = request.get_json() or {}
        enabled = bool(data.get('enabled', False))
        current_app.config['ACTIVE_OBSERVERS_ONLY'] = enabled
        # Persist setting
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'ACTIVE_OBSERVERS_ONLY', '1' if enabled else '0')
        return jsonify({
            'success': True,
            'enabled': enabled
        })
    else:
        enabled = bool(current_app.config.get('ACTIVE_OBSERVERS_ONLY', False))
        return jsonify({'enabled': enabled})


@api_blueprint.route('/config/startup_file', methods=['GET', 'POST'])
def startup_file_setting() -> Dict[str, Any]:
    """Get or set the startup file setting.
    
    This setting controls whether a file should be automatically loaded on program start.
    """
    
    if request.method == 'POST':
        data = request.get_json() or {}
        enabled = bool(data.get('enabled', False))
        file_path = data.get('file_path', '')
        
        current_app.config['STARTUP_FILE_ENABLED'] = enabled
        current_app.config['STARTUP_FILE_PATH'] = file_path if enabled else ''
        
        # Persist settings
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'STARTUP_FILE_ENABLED', '1' if enabled else '0')
        Settings.save_key(current_app.config, root_path, 'STARTUP_FILE_PATH', file_path if enabled else '')
        
        return jsonify({
            'success': True,
            'enabled': enabled,
            'file_path': file_path
        })
    else:
        enabled = bool(current_app.config.get('STARTUP_FILE_ENABLED', False))
        file_path = current_app.config.get('STARTUP_FILE_PATH', '')
        return jsonify({
            'enabled': enabled,
            'file_path': file_path
        })




def _kurzausgabe(obs) -> str:
    """Format observation as HALO key string (short format).
    
    Ported from monthly_report.js kurzausgabe() function.
    Special values: -1 = ' ' (not observed), -2 = '/' (not present)
    """
    first = ''
    
    # KK - observer code
    if obs.KK < 100:
        first += str(obs.KK // 10) + str(obs.KK % 10)
    else:
        first += chr((obs.KK // 10) + 55) + str(obs.KK % 10)
    
    # O, JJ, MM, TT, g
    first += str(obs.O)
    first += str(obs.JJ // 10) + str(obs.JJ % 10)
    first += str(obs.MM // 10) + str(obs.MM % 10)
    first += str(obs.TT // 10) + str(obs.TT % 10)
    first += str(obs.g)
    
    # ZS, ZM - handle -1 (space), 0 is a valid value for sun/moon altitude
    def fmt2(val):
        """Format 2-digit field: -1→'  ', else number (0 is valid!)"""
        if val == -1:
            return '  '  # Not observed
        else:
            return str(val // 10) + str(val % 10)
    
    def fmt2_ho_hu(val):
        """Format 2-digit field for HO/HU: -1→'  ', 0→'//', else number"""
        if val == -1:
            return '  '  # Not observed
        elif val == 0:
            return '//'  # Not applicable
        else:
            return str(val // 10) + str(val % 10)
    
    first += fmt2(obs.ZS)
    first += fmt2(obs.ZM)
    
    # d - single digit field
    def fmt1(val):
        """Format 1-digit field: -1→' ', else number"""
        if val == -1:
            return ' '  # Not observed
        else:
            return str(val)
    
    first += fmt1(obs.d)
    first += fmt2(obs.DD)
    
    # N, C, c
    first += fmt1(obs.N)
    first += fmt1(obs.C)
    first += fmt1(obs.c)
    
    # EE
    first += str(obs.EE // 10) + str(obs.EE % 10)
    
    # H, F, V
    first += fmt1(obs.H)
    first += fmt1(obs.F)
    first += fmt1(obs.V)
    
    # f, zz, GG
    first += fmt1(obs.f)
    
    # zz special: 99 means '//', -1 means '  ', -2 means '//'
    if obs.zz == 99:
        first += '//'
    else:
        first += fmt2(obs.zz)
    
    gg = obs.GG if obs.GG != -1 else 0
    first += str(gg // 10) + str(gg % 10)
    
    # Add spaces after every 5 characters
    erg = ''
    for i in range(0, len(first), 5):
        chunk = first[i:i+5]
        if chunk:
            erg += chunk
            if len(chunk) == 5:
                erg += ' '
    
    # 8HHHH - light pillar (HO=0 or HU=0 formatted as '//')
    if obs.EE == 8:
        ho_str = fmt2_ho_hu(obs.HO)
        erg += '8' + ho_str + '//'
    elif obs.EE == 9:
        hu_str = fmt2_ho_hu(obs.HU)
        erg += '8//' + hu_str
    elif obs.EE == 10:
        ho_str = fmt2_ho_hu(obs.HO)
        hu_str = fmt2_ho_hu(obs.HU)
        erg += '8' + ho_str + hu_str
    else:
        erg += '/////'
    
    # Add sectors and remarks - total line must be exactly 69 chars + sectors + remarks
    erg += ' '
    sectors = getattr(obs, 'sectors', '')
    sectors = sectors.replace('\r', ' ').replace('\n', ' ')[:15].ljust(15)
    erg += sectors + ' '
    remarks = getattr(obs, 'remarks', '')
    remarks = remarks.replace('\r', ' ').replace('\n', ' ').ljust(60)
    erg += remarks
    
    return erg


def _format_monthly_report_text(data: Dict[str, Any], i18n) -> str:
    """Format monthly report as pseudographic text with box-drawing characters.
    
    Ported from monthly_report.js buildPseudografikReport() function.
    """
    # Use i18n month names
    month_name = i18n.get(f'months.{data["mm"]}', str(data['mm']))
    
    # Format title
    year = 1900 + data['jj'] if data['jj'] >= 50 else 2000 + data['jj']
    title = i18n.get('monthly_report.report_title_template')
    title = title.replace('{observer}', data['observer_name'])
    title = title.replace('{month}', month_name)
    title = title.replace('{year}', str(year))
    
    lines = []
    
    # Header box
    title_pad_left = (122 - len(title)) // 2
    lines.append(' ' * title_pad_left + title)
    lines.append(' ' * title_pad_left + '═' * len(title))
    lines.append('')
    lines.append('╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗')
    
    sectors = i18n.get('fields.sectors')
    remarks = i18n.get('fields.remarks')
    header_line = f"KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH {sectors.ljust(15)[:15]} {remarks.ljust(47)[:47]}"
    lines.append('║ ' + header_line[:118].ljust(118) + ' ║')
    lines.append('╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣')
    
    # Observations
    last_day = -1
    observations = data.get('observations', [])
    
    # Convert dict observations to objects if needed
    obs_objects = []
    for obs_data in observations:
        if isinstance(obs_data, dict):
            # Create Observation object from dict
            obs = Observation(
                KK=obs_data['KK'],
                O=obs_data['O'],
                JJ=obs_data['JJ'],
                MM=obs_data['MM'],
                TT=obs_data['TT'],
                g=obs_data['g'],
                ZS=obs_data['ZS'] if obs_data['ZS'] is not None else -1,
                ZM=obs_data['ZM'] if obs_data['ZM'] is not None else -1,
                d=obs_data['d'] if obs_data['d'] is not None else -1,
                DD=obs_data['DD'] if obs_data['DD'] is not None else -1,
                N=obs_data['N'] if obs_data['N'] is not None else -1,
                C=obs_data['C'] if obs_data['C'] is not None else -1,
                c=obs_data['c'] if obs_data['c'] is not None else -1,
                EE=obs_data['EE'],
                H=obs_data['H'] if obs_data['H'] is not None else -1,
                F=obs_data['F'] if obs_data['F'] is not None else -1,
                V=obs_data['V'] if obs_data['V'] is not None else -1,
                f=obs_data['f'] if obs_data['f'] is not None else -1,
                zz=obs_data['zz'] if obs_data['zz'] is not None else -1,
                GG=obs_data['GG'],
                HO=obs_data.get('HO', -1) if obs_data.get('HO') is not None else -1,
                HU=obs_data.get('HU', -1) if obs_data.get('HU') is not None else -1,
                sectors=obs_data.get('sectors', ''),
                remarks=obs_data.get('remarks', '')
            )
            obs_objects.append(obs)
        else:
            obs_objects.append(obs_data)
    
    for obs in obs_objects:
        # Add separator line between different days
        if last_day != -1 and obs.TT != last_day:
            lines.append('╟────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╢')
        
        try:
            obs_line = _kurzausgabe(obs)
            lines.append('║ ' + obs_line + ' ║')
        except Exception as e:
            lines.append('║ ERROR formatting observation                                                                                           ║')
        
        last_day = obs.TT
    
    # No observations message
    if len(obs_objects) == 0:
        no_obs_msg = i18n.get('messages.no_observations')
        padding = (118 - len(no_obs_msg)) // 2
        lines.append('║' + ' ' * 120 + '║')
        lines.append('║' + ' ' * padding + no_obs_msg + ' ' * (120 - padding - len(no_obs_msg)) + '║')
        lines.append('║' + ' ' * 120 + '║')
    
    # Footer
    lines.append('╠════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╣')
    
    hb_line = i18n.get('observers.table_primary_site') + ': ' + data['observer_hbort']
    nb_line = i18n.get('observers.table_secondary_site') + ': ' + data['observer_nbort']
    hb_pad_left = (122 - len(hb_line)) // 2
    nb_pad_left = (122 - len(nb_line)) // 2
    hb_line = ' ' * hb_pad_left + hb_line
    nb_line = ' ' * nb_pad_left + nb_line
    
    lines.append('║' + hb_line[:118].ljust(120) + '║')
    lines.append('║' + nb_line[:118].ljust(120) + '║')
    lines.append('╚════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝')
    
    return '\n'.join(lines)


def _format_monthly_report_markdown(data: Dict[str, Any], i18n) -> str:
    """Format monthly report as markdown.
    
    Ported from monthly_report.js buildMarkdownSource() function.
    """
    # Use i18n month names
    month_name = i18n.get(f'months.{data["mm"]}', str(data['mm']))
    
    # Format title
    year = 1900 + data['jj'] if data['jj'] >= 50 else 2000 + data['jj']
    title = i18n.get('monthly_report.report_title_template')
    title = title.replace('{observer}', data['observer_name'])
    title = title.replace('{month}', month_name)
    title = title.replace('{year}', str(year))
    
    md = f"# {title}\n\n"
    
    # Header line (HALO key format) with fixed padding to align columns
    md += '```\n'
    sectors_label = i18n.get('fields.sectors')
    remarks_label = i18n.get('fields.remarks')
    header_line = f"KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH {sectors_label.ljust(15)[:15]} {remarks_label.ljust(47)[:47]}"
    md += header_line + '\n'
    md += '```\n\n'
    
    # Observations using kurzausgabe format
    observations = data.get('observations', [])
    
    if len(observations) == 0:
        no_obs_msg = i18n.get('messages.no_observations')
        md += f"**{no_obs_msg}**\n\n"
    else:
        md += '```\n'
        
        # Convert dict observations to objects if needed
        for obs_data in observations:
            if isinstance(obs_data, dict):
                obs = Observation(
                    KK=obs_data['KK'],
                    O=obs_data['O'],
                    JJ=obs_data['JJ'],
                    MM=obs_data['MM'],
                    TT=obs_data['TT'],
                    g=obs_data['g'],
                    ZS=obs_data['ZS'] if obs_data['ZS'] is not None else -1,
                    ZM=obs_data['ZM'] if obs_data['ZM'] is not None else -1,
                    d=obs_data['d'] if obs_data['d'] is not None else -1,
                    DD=obs_data['DD'] if obs_data['DD'] is not None else -1,
                    N=obs_data['N'] if obs_data['N'] is not None else -1,
                    C=obs_data['C'] if obs_data['C'] is not None else -1,
                    c=obs_data['c'] if obs_data['c'] is not None else -1,
                    EE=obs_data['EE'],
                    H=obs_data['H'] if obs_data['H'] is not None else -1,
                    F=obs_data['F'] if obs_data['F'] is not None else -1,
                    V=obs_data['V'] if obs_data['V'] is not None else -1,
                    f=obs_data['f'] if obs_data['f'] is not None else -1,
                    zz=obs_data['zz'] if obs_data['zz'] is not None else -1,
                    GG=obs_data['GG'],
                    HO=obs_data.get('HO', -1) if obs_data.get('HO') is not None else -1,
                    HU=obs_data.get('HU', -1) if obs_data.get('HU') is not None else -1,
                    sectors=obs_data.get('sectors', ''),
                    remarks=obs_data.get('remarks', '')
                )
            else:
                obs = obs_data
            
            line = _kurzausgabe(obs)
            md += line + '\n'
        
        md += '```\n\n'
    
    # Footer with observer locations
    md += f"## {i18n.get('observers.table_primary_site')}\n"
    md += f"{data['observer_hbort']}\n\n"
    md += f"## {i18n.get('observers.table_secondary_site')}\n"
    md += f"{data['observer_nbort']}\n"
    
    return md


@api_blueprint.route('/monthly-report', methods=['GET'])
def get_monthly_report() -> Dict[str, Any]:
    """Generate monthly report (Monatsmeldung) for a specific observer and month.
    
    Query parameters:
        kk: Observer code (required)
        mm: Month 1-12 (required)
        jj: Year 0-99 (required)
    """
    
    
    # Check if observations are loaded
    observations = current_app.config.get('OBSERVATIONS', [])
    if not observations:
        return jsonify({'error': 'No observations loaded. Please load a file first.'}), 400
    
    kk = request.args.get('kk', '').strip()
    mm = request.args.get('mm', '').strip()
    jj = request.args.get('jj', '').strip()
    
    if not all([kk, mm, jj]):
        return jsonify({'error': 'Missing required parameters: kk, mm, jj'}), 400
    
    try:
        kk_int = int(kk)
        mm_int = int(mm)
        jj_int = int(jj)
        
        if mm_int < 1 or mm_int > 12:
            return jsonify({'error': 'Invalid month (1-12)'}), 400
        if jj_int < 0 or jj_int > 99:
            return jsonify({'error': 'Invalid year (0-99)'}), 400
    except ValueError:
        return jsonify({'error': 'Invalid numeric parameters'}), 400
    
    # Filter observations for this observer and month
    filtered_obs = [obs for obs in observations 
                    if obs.KK == kk_int and obs.MM == mm_int and obs.JJ == jj_int]
    
    # Sort by day and time
    filtered_obs.sort(key=lambda o: (o.TT, o.ZS if o.ZS != -1 else 0, o.ZM if o.ZM != -1 else 0))
    
    # Get observer info - find the record valid for this month/year
    observers = current_app.config.get('OBSERVERS', [])
    observer_name = ''
    observer_hbort = ''
    observer_nbort = ''
    observer_gh = ''
    observer_gn = ''
    
    # Create sortable seit value for this month/year: YYYYMM
    obs_year = 1900 + jj_int if jj_int >= 50 else 2000 + jj_int
    month_year_comparable = obs_year * 100 + mm_int
    
    # Find the observer record valid for this month/year
    candidates = []
    for obs_rec in observers:
        if len(obs_rec) >= 21 and obs_rec[0] == kk:
            try:
                seit_parts = obs_rec[3].split('/')
                seit_month = int(seit_parts[0])
                seit_year_2digit = int(seit_parts[1])
                seit_year = 1900 + seit_year_2digit if seit_year_2digit >= 50 else 2000 + seit_year_2digit
                rec_seit_comparable = seit_year * 100 + seit_month
                
                if rec_seit_comparable <= month_year_comparable:
                    candidates.append((rec_seit_comparable, obs_rec))
            except (ValueError, IndexError):
                pass
    
    if candidates:
        # Use the record with the most recent seit date
        candidates.sort(key=lambda x: x[0], reverse=True)
        obs_rec = candidates[0][1]
        
        observer_name = f"{obs_rec[1]} {obs_rec[2]}"
        observer_hbort = obs_rec[5]
        observer_nbort = obs_rec[13]
        # Get region indices - obs_rec[6] is GH, obs_rec[14] is GN
        try:
            gh_idx = int(obs_rec[6]) if obs_rec[6] else 0
            gn_idx = int(obs_rec[14]) if obs_rec[14] else 0
        except (ValueError, IndexError):
            gh_idx = 0
            gn_idx = 0
    else:
        gh_idx = 0
        gn_idx = 0
    
    # Get region names from i18n
    regions = g.i18n.get_array('geographic_regions') if hasattr(g, 'i18n') else {}
    
    observer_gh = regions.get(str(gh_idx), '') if gh_idx > 0 else ''
    observer_gn = regions.get(str(gn_idx), '') if gn_idx > 0 else ''
    # Combine site and region
    observer_hbort = f"{observer_hbort} ({observer_gh})" if observer_gh else observer_hbort
    observer_nbort = f"{observer_nbort} ({observer_gn})" if observer_gn else observer_nbort
    
    # Build data structure
    data = {
        'kk': kk_int,
        'mm': mm_int,
        'jj': jj_int,
        'observer_name': observer_name,
        'observer_hbort': observer_hbort,
        'observer_nbort': observer_nbort,
        'observer_gh': observer_gh,
        'observer_gn': observer_gn,
        'observations': [
            {
                'KK': obs.KK,
                'O': obs.O,
                'JJ': obs.JJ,
                'MM': obs.MM,
                'TT': obs.TT,
                'g': obs.g,
                'ZS': obs.ZS if obs.ZS != -1 else None,
                'ZM': obs.ZM if obs.ZM != -1 else None,
                'd': obs.d if obs.d != -1 else None,
                'DD': obs.DD if obs.DD != -1 else None,
                'N': obs.N if obs.N != -1 else None,
                'C': obs.C if obs.C != -1 else None,
                'c': obs.c if obs.c != -1 else None,
                'EE': obs.EE,
                'H': obs.H if obs.H != -1 else None,
                'F': obs.F if obs.F != -1 else None,
                'V': obs.V if obs.V != -1 else None,
                'f': obs.f if obs.f != -1 else None,
                'zz': obs.zz if obs.zz not in (-1, 99) else (None if obs.zz == -1 else 99),
                'GG': obs.GG,
                'HO': obs.HO if obs.HO != -1 else None,
                'HU': obs.HU if obs.HU != -1 else None,
                'sectors': getattr(obs, 'sectors', ''),
                'remarks': getattr(obs, 'remarks', ''),
            }
            for obs in filtered_obs
        ],
        'count': len(filtered_obs)
    }
    
    # Check requested format
    output_format = request.args.get('format', 'json').lower()
    
    if output_format in ['json', 'html']:
        # JSON format and HTML format both return data; HTML is formatted client-side
        return jsonify(data)
    elif output_format in ['text', 'markdown']:
        # Get i18n for formatting
        i18n = get_i18n()
        
        if output_format == 'text':
            content = _format_monthly_report_text(data, i18n)
            return Response(content, mimetype='text/plain; charset=utf-8')
        elif output_format == 'markdown':
            content = _format_monthly_report_markdown(data, i18n)
            return Response(content, mimetype='text/markdown; charset=utf-8')
    else:
        return jsonify({'error': f'Invalid format: {output_format}. Use json, text, or markdown.'}), 400



def _format_monthly_stats_text(data: Dict[str, Any], month_name: str, year: str, i18n) -> str:
    """Format monthly statistics as plain text with pseudographic tables."""
    lines = []
    
    
    # Table 1: Observer Overview
    if data.get('observer_overview'):
        lines.append('╔' + '═' * 86 + '╗')
        header = f"{i18n.get('monthly_stats.observer_overview')} {month_name} {year}"
        padding = max(0, (86 - len(header)) // 2)
        lines.append('║' + ' ' * padding + header + ' ' * (86 - padding - len(header)) + '║')
        lines.append('╠════╦══════════╦══════════╦══════════╦══════════╦══════════╦════════════╦═════════════╣')
        lines.append('║KKGG║ 1   3   5║   7   9  ║11  13  15║  17  19  ║21  23  25║  27  29  31║ 1) 2) 3) 4) ║')
        lines.append('║    ║   2   4  ║ 6   8  10║  12  14  ║16  18  20║  22  24  ║26  28  30  ║             ║')
        lines.append('╠════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════════════╣')
        
        row_count = 0
        for obs in data['observer_overview']:
            kk = str(obs['kk']).zfill(2)
            gg = '//' if obs['region'] == 39 else str(obs['region']).zfill(2)
            line = f'║{kk}{gg}║'
            
            # Days 1-31 in groups of 5
            for day in range(1, 32):
                day_data = obs['days'].get(str(day), {})
                solar = day_data.get('solar', 0)
                lunar = day_data.get('lunar', False)
                
                if solar > 0 and lunar:
                    cell = '_' + str(solar)
                elif solar > 0:
                    cell = f'{solar:2d}'
                elif lunar:
                    cell = ' X'
                else:
                    cell = '  '
                
                line += cell
                if day % 5 == 0 and day != 30:
                    line += '║'
            
            line += '║'
            line += f"{obs['total_solar']:3d} "
            line += f"{obs['days_solar']:2d} "
            line += f"{obs['days_lunar']:2d} "
            line += f"{obs['total_days']:2d} "
            line += '║'
            lines.append(line)
            
            row_count += 1
            if row_count % 5 == 0 and row_count < len(data['observer_overview']):
                lines.append('╠════╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════════════╣')
        
        footnote = i18n.get('statistics.footnote_ee_days').replace('&nbsp;', ' ')
        footnote = footnote.replace('<br>', '\n║  ')
        lines.append('╠════╩══════════╩══════════╩══════════╩══════════╩══════════╩════════════╩═════════════╣')
        # Calculate correct padding: total width = 88, borders = 2, content = 86, indent = 2
        footnote_with_indent = '  ' + footnote
        padding = ' ' * (86 - len(footnote_with_indent))
        lines.append('║' + footnote_with_indent + padding + '║')
        lines.append('╚' + '═' * 86 + '╝')
        lines.append('')
    
    # Table 2: EE Overview
    if data.get('ee_overview'):
        lines.append('    ╔' + '═' * 76 + '╗')
        header = f"{i18n.get('monthly_stats.ee_overview')} {month_name} {year}"
        padding = max(0, (76 - len(header)) // 2)
        lines.append('    ║' + ' ' * padding + header + ' ' * (76 - padding - len(header)) + '║')
        lines.append('    ╠══╦══════════╦══════════╦══════════╦══════════╦══════════╦════════════╦═════╣')
        lines.append('    ║EE║ 1   3   5║   7   9  ║11  13  15║  17  19  ║21  23  25║  27  29  31║ ges ║')
        lines.append('    ║  ║   2   4  ║ 6   8  10║  12  14  ║16  18  20║  22  24  ║26  28  30  ║     ║')
        lines.append('    ╠══╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣')
        
        row_count = 0
        for ee_row in data['ee_overview']:
            ee = f"{ee_row['ee']:02d}"
            line = f'    ║{ee}║'
            
            for day in range(1, 32):
                count = ee_row['days'].get(str(day), 0)
                cell = f'{count:2d}' if count > 0 else '  '
                line += cell
                if day % 5 == 0 and day != 30:
                    line += '║'
            
            line += '║'
            line += f"{ee_row['total']:4d} ║"
            lines.append(line)
            
            row_count += 1
            current_ee = ee_row['ee']
            is_last = row_count >= len(data['ee_overview'])
            is_before_group567 = current_ee == 5 or current_ee == 6
            
            if not is_last and not is_before_group567:
                lines.append('    ╠══╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣')
        
        # Daily totals row
        lines.append('    ╠══╬══════════╬══════════╬══════════╬══════════╬══════════╬════════════╬═════╣')
        line = '    ║Σ ║'
        for day in range(1, 32):
            count = data['daily_totals'].get(str(day), 0)
            cell = f'{count:2d}' if count > 0 else '  '
            line += cell
            if day % 5 == 0 and day != 30:
                line += '║'
        line += '║'
        line += f"{data['grand_total']:4d} ║"
        lines.append(line)
        lines.append('    ╚══╩══════════╩══════════╩══════════╩══════════╩══════════╩════════════╩═════╝')
        lines.append('')
    
    # Table 3: Rare Halos
    lines.append('    ╔' + '═' * 77 + '╗')
    header = i18n.get('monthly_stats.rare_halos')
    padding = max(0, (77 - len(header)) // 2)
    lines.append('    ║' + ' ' * padding + header + ' ' * (77 - padding - len(header)) + '║')
    
    if not data.get('rare_halos'):
        lines.append('    ╠' + '═' * 77 + '╣')
        msg = i18n.get('monthly_stats.rare_halos_none').replace('{month}', month_name)
        padding = max(0, (77 - len(msg)) // 2)
        lines.append('    ║' + ' ' * padding + msg + ' ' * (77 - padding - len(msg)) + '║')
        lines.append('    ╚' + '═' * 77 + '╝')
    else:
        lines.append('    ╠════════════╦════════════╦════════════╦════════════╦════════════╦════════════╣')
        lines.append('    ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║ TT EE KKGG ║')
        lines.append('    ╠════════════╬════════════╬════════════╬════════════╬════════════╬════════════╣')
        
        # Insert empty slots when day changes
        displayed_items = []
        last_day = None
        for halo in data['rare_halos']:
            if last_day is not None and halo['tt'] != last_day:
                displayed_items.append(None)
            displayed_items.append(halo)
            last_day = halo['tt']
        
        items_per_column = (len(displayed_items) + 5) // 6
        for row in range(items_per_column):
            line = '    ║'
            for col in range(6):
                idx = col * items_per_column + row
                if idx < len(displayed_items) and displayed_items[idx] is not None:
                    h = displayed_items[idx]
                    tt_str = f"{h['tt']:2d}"
                    ee_str = f"{h['ee']:02d}"
                    line += f" {tt_str} {ee_str} {h['kk']}{h['gg']} ║"
                else:
                    line += '            ║'
            lines.append(line)
        
        lines.append('    ╚════════════╩════════════╩════════════╩════════════╩════════════╩════════════╝')
    
    lines.append('')
    
    # Table 4: Activity
    if data.get('activity_real') and data.get('activity_relative'):
        lines.append('╔' + '═' * 86 + '╗')
        header = f"{i18n.get('monthly_stats.activity_title')} {month_name} {year}"
        padding = max(0, (86 - len(header)) // 2)
        lines.append('║' + ' ' * padding + header + ' ' * (86 - padding - len(header)) + '║')
        lines.append('╠═════╦════════════════════════╦════════════════════════╦════════════════════════╦═════╣')
        
        # First table: Days 1-16
        day_label = i18n.get('statistics.table_day')
        lines.append(f'║ {day_label:3s} ║  1.   2.   3.   4.   5.║  6.   7.   8.   9.  10.║ 11.  12.  13.  14.  15.║ 16. ║')
        lines.append('╠═════╬════════════════════════╬════════════════════════╬════════════════════════╬═════╣')
        
        # Real activity (days 1-16)
        line = '║ real║'
        for d in range(1, 17):
            val = data['activity_real'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 16:
                line += ' ║'
            else:
                line += ' '
        lines.append(line)
        
        lines.append('╠═════╬════════════════════════╬════════════════════════╬════════════════════════╬═════╣')
        
        # Relative activity (days 1-16)
        line = '║ rel.║'
        for d in range(1, 17):
            val = data['activity_relative'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 16:
                line += ' ║'
            else:
                line += ' '
        lines.append(line)
        lines.append('╚═════╩════════════════════════╩════════════════════════╩════════════════════════╩═════╝')
        
        # Second table: Days 17-31
        lines.append('╔═════╦═══════════════════╦════════════════════════╦════════════════════════╦════╦═════╗')
        lines.append(f'║ {day_label:3s} ║ 17.  18.  19.  20.║ 21.  22.  23.  24.  25.║ 26.  27.  28.  29.  30.║ 31.║ ges ║')
        lines.append('╠═════╬═══════════════════╬════════════════════════╬════════════════════════╬════╬═════╣')
        
        # Real activity (days 17-31)
        line = '║ real║'
        for d in range(17, 32):
            val = data['activity_real'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 31:
                line += '║'
            else:
                line += ' '
        total_real = data['activity_totals']['real']
        line += f'{total_real:5.1f}║'
        lines.append(line)
        
        lines.append('╠═════╬═══════════════════╬════════════════════════╬════════════════════════╬════╬═════╣')
        
        # Relative activity (days 17-31)
        line = '║ rel.║'
        for d in range(17, 32):
            val = data['activity_relative'].get(str(d), 0.0)
            line += f'{val:4.1f}'
            if d % 5 == 0:
                line += '║'
            elif d == 31:
                line += '║'
            else:
                line += ' '
        total_rel = data['activity_totals']['relative']
        line += f'{total_rel:5.1f}║'
        lines.append(line)
        lines.append('╚═════╩═══════════════════╩════════════════════════╩════════════════════════╩════╩═════╝')
    
    return '\n'.join(lines)


def _format_monthly_stats_html(data: Dict[str, Any], month_name: str, year: str, i18n) -> str:
    """Format monthly statistics as HTML - returns JSON for client-side HTML formatting."""
    # Return JSON data; client-side formatter will generate HTML tables
    return json.dumps(data)


def _format_monthly_stats_markdown(data: Dict[str, Any], month_name: str, year: str, i18n) -> str:
    """Format monthly statistics as Markdown with pipe tables."""
    lines = []
    
    # Table 1: Observer Overview
    if data.get('observer_overview'):
        lines.append(f"## {i18n.get('monthly_stats.observer_overview')} {month_name} {year}")
        lines.append('')
        
        # Header row
        header = '| KKGG |'
        for d in range(1, 32):
            header += f' {d} |'
        header += ' 1) | 2) | 3) | 4) |'
        lines.append(header)
        
        # Separator row
        separator = '|:---:|'
        for d in range(1, 32):
            separator += ':---:|'
        separator += ':---:|---:|---:|---:|'
        lines.append(separator)
        
        # Data rows
        for obs in data['observer_overview']:
            kk = str(obs['kk']).zfill(2)
            gg = '//' if obs['region'] == 39 else str(obs['region']).zfill(2)
            row = f'| {kk}{gg} |'
            
            for day in range(1, 32):
                day_data = obs['days'].get(str(day), {})
                solar = day_data.get('solar', 0)
                lunar = day_data.get('lunar', False)
                
                if solar > 0 and lunar:
                    cell = f'_{solar}'
                elif solar > 0:
                    cell = str(solar)
                elif lunar:
                    cell = 'X'
                else:
                    cell = ''
                
                row += f' {cell} |'
            
            row += f" {obs['total_solar']} |"
            row += f" {obs['days_solar']} |"
            row += f" {obs['days_lunar']} |"
            row += f" {obs['total_days']} |"
            lines.append(row)
        
        footnote = i18n.get('statistics.footnote_ee_days', '1) = EE (Sonne)  2) = Tage (Sonne)  3) = Tage (Mond)  4) = Tage (gesamt)').replace('<br>', ' ')
        footnote = footnote.replace('&nbsp;', ' ')
        lines.append('')
        lines.append(f'_{footnote}_')
        lines.append('')
    
    # Table 2: EE Overview
    if data.get('ee_overview'):
        lines.append(f"## {i18n.get('monthly_stats.ee_overview')} {month_name} {year}")
        lines.append('')
        
        # Header row
        header = '| EE |'
        for d in range(1, 32):
            header += f' {d} |'
        header += ' ges |'
        lines.append(header)
        
        # Separator row
        separator = '|:---:|'
        for d in range(1, 32):
            separator += ':---:|'
        separator += '---:|'
        lines.append(separator)
        
        # Data rows
        for ee_row in data['ee_overview']:
            ee = f"{ee_row['ee']:02d}"
            row = f'| {ee} |'
            
            for day in range(1, 32):
                count = ee_row['days'].get(str(day), 0)
                cell = str(count) if count > 0 else ''
                row += f' {cell} |'
            
            row += f" {ee_row['total']} |"
            lines.append(row)
        
        # Totals row
        row = '| **Σ** |'
        for day in range(1, 32):
            count = data['daily_totals'].get(str(day), 0)
            cell = str(count) if count > 0 else ''
            row += f' {cell} |'
        row += f" **{data['grand_total']}** |"
        lines.append(row)
        lines.append('')
    
    # Table 3: Rare Halos
    lines.append(f"## {i18n.get('monthly_stats.rare_halos')}")
    lines.append('')
    
    if not data.get('rare_halos'):
        msg = i18n.get('monthly_stats.rare_halos_none').replace('{month}', month_name)
        lines.append(f'*{msg}*')
    else:
        lines.append('| TT | EE | KKGG |')
        lines.append('|---:|:---|:-----|')
        
        for halo in data['rare_halos']:
            lines.append(f"| {halo['tt']} | {halo['ee']:02d} | {halo['kk']}{halo['gg']} |")
    
    lines.append('')
    
    # Table 4: Activity
    if data.get('activity_real') and data.get('activity_relative'):
        lines.append(f"## {i18n.get('monthly_stats.activity_title')} {month_name} {year}")
        lines.append('')
        
        day_label = i18n.get('statistics.table_day')
        
        # Header row
        header = f'| {day_label} |'
        for d in range(1, 32):
            header += f' {d} |'
        header += ' ges |'
        lines.append(header)
        
        # Separator row
        separator = '|:---:|'
        for d in range(1, 32):
            separator += '---:|'
        separator += '---:|'
        lines.append(separator)
        
        # Real activity row
        row = '| real |'
        for d in range(1, 32):
            val = data['activity_real'].get(str(d), 0.0)
            row += f' {val:.1f} |'
        total_real = data['activity_totals']['real']
        row += f' {total_real:.1f} |'
        lines.append(row)
        
        # Relative activity row
        row = '| rel. |'
        for d in range(1, 32):
            val = data['activity_relative'].get(str(d), 0.0)
            row += f' {val:.1f} |'
        total_rel = data['activity_totals']['relative']
        row += f' {total_rel:.1f} |'
        lines.append(row)
        lines.append('')
    
    return '\n'.join(lines)


@api_blueprint.route('/monthly-stats', methods=['GET'])
def get_monthly_stats() -> Dict[str, Any]:
    """Generate monthly statistics (Monatsstatistik) for a specific month.
    
    Query parameters:
        mm: Month 1-12 (required)
        jj: Year 0-99 (required)
        format: Output format - 'json' (default), 'html', 'text', or 'markdown'
    
    Returns observer overview table with:
    - Days 1-31 as columns
    - Active observers as rows
    - Cell values: number of solar halo types, or 'X' for lunar only, or '_N' for both
    - Summary columns: total solar halos, days with solar, days with lunar, total days
    
    Note: Combined halo types (e.g., EE 04 = both 22° parhelia) are resolved to
    their individual components (EE 02 + EE 03) for statistical counting.
    """
    
    # Check if observations are loaded
    observations = current_app.config.get('OBSERVATIONS', [])
    observers = current_app.config.get('OBSERVERS', [])
    active_observers_only = bool(current_app.config.get('ACTIVE_OBSERVERS_ONLY', False))
    
    if not observations:
        return jsonify({'error': 'No observations loaded. Please load a file first.'}), 400
    
    mm = request.args.get('mm', '').strip()
    jj = request.args.get('jj', '').strip()
    
    if not all([mm, jj]):
        return jsonify({'error': 'Missing required parameters: mm, jj'}), 400
    
    try:
        mm_int = int(mm)
        jj_int = int(jj)
        
        if mm_int < 1 or mm_int > 12:
            return jsonify({'error': 'Invalid month (1-12)'}), 400
        if jj_int < 0 or jj_int > 99:
            return jsonify({'error': 'Invalid year (0-99)'}), 400
    except ValueError:
        return jsonify({'error': 'Invalid numeric parameters'}), 400
    
    # Filter observations for this month
    filtered_obs = [obs for obs in observations 
                    if obs.MM == mm_int and obs.JJ == jj_int]
    
    # Get all active observers at the end of this month/year (SEIT <= MMJJ)
    # Build SEIT value for comparison using same formula as _parse_seit: mm + 13 * jj
    month_year_value = mm_int + 13 * jj_int
    
    # Get unique active observers up to this month/year
    active_observers = {}
    for obs_record in observers:
        kk = obs_record[0]  # Column 0: KK
        seit_str = obs_record[3]  # Column 3: seit (MM/JJ format)
        aktiv_str = obs_record[4]  # Column 4: aktiv (0 or 1)
        
        # Parse seit from "MM/JJ" to integer MMJJ
        seit = _parse_seit(seit_str) if seit_str else 0
        
        # Parse aktiv to integer
        try:
            aktiv = int(aktiv_str) if aktiv_str else 0
        except (ValueError, TypeError):
            aktiv = 0
        
        # Observer is active if:
        # 1. They started before or during this month (seit <= month_year_value)
        # 2. If active_observers_only is True, they must be marked as active (aktiv == 1)
        #    If active_observers_only is False, include all observers (matches Pascal: aktbeob<>'J')
        if seit <= month_year_value:
            if not active_observers_only or aktiv == 1:
                # Keep the most recent record for each KK
                if kk not in active_observers or seit > _parse_seit(active_observers[kk][3]):
                    active_observers[kk] = obs_record
    
    # Build observer overview table
    # Structure: observer_data[KK] = {
    #   'days': {1..31: {'solar_ee': set of EE, 'lunar': has_lunar}},
    #   'total_solar': count,
    #   'days_solar': count,
    #   'days_lunar': count,
    #   'total_days': count,
    #   'region': GG
    # }
    observer_data = {}
    
    # Initialize all active observers with empty data
    for kk, obs_record in active_observers.items():
        observer_data[kk] = {
            'days': {},
            'total_solar': 0,
            'days_solar': 0,
            'days_lunar': 0,
            'total_days': 0,
            'region': int(obs_record[6]) if obs_record[6] else 0  # Column 6: GH (home region)
        }
    
    # Process each observation to fill in observation data
    for obs in filtered_obs:
        kk = str(obs.KK).zfill(2)  # Ensure KK is string with leading zero (e.g., "06")
        tt = obs.TT
        o = obs.O  # 1=solar, 2=lunar
        ee = obs.EE  # Halo type
        
        # Only process observations from active observers (skip inactive observers' data)
        if kk not in observer_data:
            continue
        
        # Initialize day data if needed
        if tt not in observer_data[kk]['days']:
            observer_data[kk]['days'][tt] = {'solar_ee': set(), 'lunar': False}
        
        # Track unique solar halo types (O=1)
        # Combined halo types are resolved to individual components
        # Example: EE 04 (both 22° parhelia) → EE 02 + EE 03
        if o == 1:
            for individual_ee in resolve_halo_type(ee):
                observer_data[kk]['days'][tt]['solar_ee'].add(individual_ee)
        
        # Mark if lunar halos observed (O=2)
        if o == 2:
            observer_data[kk]['days'][tt]['lunar'] = True
    
    # Calculate summary statistics and determine predominant region per observer
    for kk in observer_data:
        days_with_solar = set()
        days_with_lunar = set()
        region_counts = {}
        total_unique_solar_ee = 0
        
        for tt in observer_data[kk]['days']:
            day_data = observer_data[kk]['days'][tt]
            
            # Count unique solar halo types for this day
            num_unique_ee = len(day_data['solar_ee'])
            if num_unique_ee > 0:
                days_with_solar.add(tt)
                total_unique_solar_ee += num_unique_ee
            
            if day_data['lunar']:
                days_with_lunar.add(tt)
        
        observer_data[kk]['total_solar'] = total_unique_solar_ee
        
        # Determine predominant region based on where most observations were made
        # Logic: Count observation days by site indicator (g)
        #   g=0: primary site (HbOrt) -> use GH from observer record
        #   g=1: other location -> display as // (region 39)
        #   g=2: secondary site (NbOrt) -> use GN from observer record
        obs_for_kk = [obs for obs in filtered_obs if str(obs.KK).zfill(2) == kk]
        
        # Track which days have observations at which site (g value)
        site_days = {0: set(), 1: set(), 2: set()}  # g -> set of days
        for obs in obs_for_kk:
            g = obs.g if hasattr(obs, 'g') and obs.g in [0, 1, 2] else 0
            site_days[g].add(obs.TT)
        
        # Find site (g value) with most observation days
        max_site = max(site_days.items(), key=lambda x: len(x[1]))
        predominant_g = max_site[0]
        
        # Determine region based on predominant site:
        if predominant_g == 1:
            # Most observations at "other" location -> display //
            predominant_region = 39
        elif predominant_g == 0:
            # Most observations at primary site -> use GH from observer record (column 6)
            predominant_region = int(active_observers[kk][6]) if active_observers[kk][6] else 39
        elif predominant_g == 2:
            # Most observations at secondary site -> use GN from observer record (column 14)
            predominant_region = int(active_observers[kk][14]) if active_observers[kk][14] else 39
        else:
            # Fallback
            predominant_region = int(active_observers[kk][6]) if active_observers[kk][6] else 39
        
        observer_data[kk]['region'] = predominant_region
        
        observer_data[kk]['days_solar'] = len(days_with_solar)
        observer_data[kk]['days_lunar'] = len(days_with_lunar)
        observer_data[kk]['total_days'] = len(set(list(days_with_solar) + list(days_with_lunar)))
    
    # Build observer list with all active observers (including those with no observations)
    # Sort by region then KK
    observer_list = []
    for kk, data in observer_data.items():
        # Convert solar_ee sets to counts for JSON serialization
        days_dict = {}
        for tt, day_data in data['days'].items():
            days_dict[str(tt)] = {  # Convert day number to string for JSON compatibility
                'solar': len(day_data['solar_ee']),  # Count unique EE values
                'lunar': day_data['lunar']
            }
        
        observer_list.append({
            'kk': kk,
            'region': data['region'],
            'days': days_dict,
            'total_solar': data['total_solar'],
            'days_solar': data['days_solar'],
            'days_lunar': data['days_lunar'],
            'total_days': data['total_days']
        })
    
    # Sort by region, then by KK
    observer_list.sort(key=lambda x: (x['region'], x['kk']))
    
    # Build EE overview table (Ergebnisübersicht Sonnenhalos)
    # Structure: ee_overview[EE] = {1..31: count_of_observers}
    # Count how many observers saw each halo type on each day
    # Note: Same observer seeing same EE multiple times on same day counts only once
    ee_overview = {}
    
    for obs in filtered_obs:
        if obs.O != 1:  # Only solar halos (O=1)
            continue
        
        kk = str(obs.KK).zfill(2)
        tt = obs.TT
        ee = obs.EE
        
        # Skip if observer not in active list
        if kk not in observer_data:
            continue
        
        # Resolve combined halo types to individual components
        for individual_ee in resolve_halo_type(ee):
            if individual_ee not in ee_overview:
                ee_overview[individual_ee] = {}
            
            if tt not in ee_overview[individual_ee]:
                ee_overview[individual_ee][tt] = set()
            
            # Add observer to set (ensures same observer counts only once per day)
            ee_overview[individual_ee][tt].add(kk)
    
    # Convert sets to counts and calculate totals
    # Filter to only show specific EE types: 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12
    allowed_ee_types = {1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12}
    
    ee_list = []
    for ee in sorted(ee_overview.keys()):
        # Skip EE types not in the allowed list
        if ee not in allowed_ee_types:
            continue
            
        days_dict = {}
        total_count = 0
        
        for tt in range(1, 32):  # Days 1-31
            if tt in ee_overview[ee]:
                count = len(ee_overview[ee][tt])
                days_dict[str(tt)] = count
                total_count += count
            else:
                days_dict[str(tt)] = 0
        
        ee_list.append({
            'ee': ee,
            'days': days_dict,
            'total': total_count
        })
    
    # Calculate daily totals (sum across allowed EE types only for each day)
    daily_totals = {}
    for tt in range(1, 32):
        daily_totals[tt] = sum(
            len(ee_overview[ee].get(tt, set())) 
            for ee in ee_overview
            if ee in allowed_ee_types
        )
    
    # Calculate grand total
    grand_total = sum(daily_totals.values())
    
    # Collect rare halos (EE > 12) for third table
    # Structure: rare_halos = [{tt, ee, kk, gg}, ...] sorted by day, then EE, then KK
    rare_halos = []
    
    for obs in filtered_obs:
        if obs.O != 1:  # Only solar halos (O=1)
            continue
        
        kk = str(obs.KK).zfill(2)
        
        # Skip if observer not in active list
        if kk not in observer_data:
            continue
        
        # Resolve combined halo types to check for rare halos
        for individual_ee in resolve_halo_type(obs.EE):
            if individual_ee > 12:
                # Use GG directly from observation record
                gg = obs.GG
                
                rare_halos.append({
                    'tt': obs.TT,
                    'ee': individual_ee,
                    'kk': kk,
                    'gg': str(gg).zfill(2) if gg != 39 else '//'
                })
    
    # Sort rare halos by day, then EE, then KK
    rare_halos.sort(key=lambda x: (x['tt'], x['ee'], x['kk']))
    
    # Calculate halo activity (real and relative)
    # Get all observations for the month (not just solar)
    activity_data = calculate_halo_activity(
        observations=filtered_obs,
        observers=active_observers,  # Pass the dict, not the raw list
        mm=mm_int,
        jj=jj_int,
        active_observers_only=active_observers_only
    )
    
    # Apply 30-day normalization (Pascal: aktf[i] * 30 / tprom[mm])
    # This ensures activity values are comparable across months of different lengths
    days_in_month = get_days_in_month(mm_int, jj_int)
    normalization_factor = 30.0 / days_in_month
    
    # Apply normalization to daily and total activity values
    # Convert keys to strings for consistency with formatting functions
    normalized_real = {str(day): value * normalization_factor for day, value in activity_data['real'].items()}
    normalized_relative = {str(day): value * normalization_factor for day, value in activity_data['relative'].items()}
    normalized_total_real = activity_data['total_real'] * normalization_factor
    normalized_total_relative = activity_data['total_relative'] * normalization_factor
    
    # Build data structure
    data = {
        'mm': mm_int,
        'jj': jj_int,
        'observer_overview': observer_list,
        'ee_overview': ee_list,
        'daily_totals': daily_totals,
        'grand_total': grand_total,
        'rare_halos': rare_halos,
        'activity_real': normalized_real,
        'activity_relative': normalized_relative,
        'activity_totals': {
            'real': normalized_total_real,
            'relative': normalized_total_relative
        },
        'activity_count': activity_data['active_count'],
        'activity_observation_count': activity_data['observation_count'],
        'count': len(filtered_obs)
    }
    
    # Check requested format
    output_format = request.args.get('format', 'json').lower()
    
    if output_format in ['json', 'html']:
        # JSON format and HTML format both return data; HTML is formatted client-side
        return jsonify(data)
    elif output_format in ['text', 'markdown']:
        # Get month name and formatted year for display
        i18n = get_i18n()
        month_name = i18n.get(f'months.{mm_int}')
        year = f"19{str(jj_int).zfill(2)}" if jj_int >= 50 else f"20{str(jj_int).zfill(2)}"
        
        if output_format == 'text':
            content = _format_monthly_stats_text(data, month_name, year, i18n)
            return Response(content, mimetype='text/plain; charset=utf-8')
        elif output_format == 'markdown':
            content = _format_monthly_stats_markdown(data, month_name, year, i18n)
            return Response(content, mimetype='text/markdown; charset=utf-8')
    elif output_format == 'linegraph':
        # Generate PNG line chart
        i18n = get_i18n()
        img_data = _generate_monthly_stats_chart(data, mm_int, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    elif output_format == 'bargraph':
        # Generate PNG bar chart
        i18n = get_i18n()
        img_data = _generate_monthly_stats_bar_chart(data, mm_int, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    else:
        return jsonify({'error': f'Invalid format: {output_format}. Use json, text, markdown, linegraph, or bargraph.'}), 400


def _generate_monthly_stats_chart(data: Dict[str, Any], mm: int, jj: int, i18n) -> bytes:
    """Generate activity chart as PNG image using matplotlib.
    
    Creates a line chart with:
    - Red line: Real activity (normalized)
    - Green line: Relative activity (normalized)
    - Days 1-31 on x-axis
    - Title and subtitle with month/year and observation count
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - days 1-31
    days = list(range(1, 32))
    real_data = [data.get('activity_real', {}).get(str(d), 0) for d in days]
    relative_data = [data.get('activity_relative', {}).get(str(d), 0) for d in days]
    
    # Get month name and year for title
    month_name = i18n.get(f'months.{mm}')
    year = f"19{str(jj).zfill(2)}" if jj >= 50 else f"20{str(jj).zfill(2)}"
    observation_count = data.get('activity_observation_count', 0)
    
    # Get labels from i18n
    label_real = i18n.get('monthly_stats.activity_real')
    label_relative = i18n.get('monthly_stats.activity_relative')
    x_axis_label = i18n.get('monthly_stats.x_axis')
    y_axis_label = i18n.get('monthly_stats.y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Create smooth spline interpolation (like Chart.js tension: 0.4)
    days_smooth = np.linspace(1, 31, 300)  # 300 points for smooth curve
    
    # Smooth interpolation for real data
    if max(real_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        real_smooth = np.interp(days_smooth, days, real_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        real_smooth = np.convolve(real_smooth, kernel, mode='same')
        real_smooth = np.maximum(real_smooth, 0)  # Clip to [0, inf)
        ax.plot(days_smooth, real_smooth, color='#dc3545', linewidth=2, label=label_real)
    else:
        ax.plot(days, real_data, color='#dc3545', linewidth=2, label=label_real)
    
    # Smooth interpolation for relative data
    if max(relative_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        relative_smooth = np.interp(days_smooth, days, relative_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        relative_smooth = np.convolve(relative_smooth, kernel, mode='same')
        relative_smooth = np.maximum(relative_smooth, 0)  # Clip to [0, inf)
        ax.plot(days_smooth, relative_smooth, color='#28a745', linewidth=2, label=label_relative)
    else:
        ax.plot(days, relative_data, color='#28a745', linewidth=2, label=label_relative)
    
    # Add data points as markers
    ax.plot(days, real_data, 'o', color='#dc3545', markersize=4, markerfacecolor='#dc3545')
    ax.plot(days, relative_data, 'o', color='#28a745', markersize=4, markerfacecolor='#28a745')
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xlim(0.5, 31.5)
    ax.set_ylim(bottom=0)
    ax.set_xticks(range(1, 32))
    ax.grid(True, alpha=0.3, linestyle='--')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title and subtitle
    title = f'Haloaktivität im {month_name} {year}'
    subtitle = f'berechnet aus {observation_count} Einzelbeobachtungen'
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    ax.text(0.5, 1.02, subtitle, transform=ax.transAxes, 
            ha='center', va='bottom', fontsize=10, style='italic')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.96])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _generate_monthly_stats_bar_chart(data: Dict[str, Any], mm: int, jj: int, i18n) -> bytes:
    """Generate activity bar chart as PNG image using matplotlib.
    
    Creates a bar chart with:
    - Two side-by-side bars for each day: red (real) and green (relative)
    - Days 1-31 on x-axis
    - Title and subtitle with month/year and observation count
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - days 1-31
    days = list(range(1, 32))
    real_data = [data.get('activity_real', {}).get(str(d), 0) for d in days]
    relative_data = [data.get('activity_relative', {}).get(str(d), 0) for d in days]
    
    # Get month name and year for title
    month_name = i18n.get(f'months.{mm}')
    year = f"19{str(jj).zfill(2)}" if jj >= 50 else f"20{str(jj).zfill(2)}"
    observation_count = data.get('activity_observation_count', 0)
    
    # Get labels from i18n
    label_real = i18n.get('monthly_stats.activity_real')
    label_relative = i18n.get('monthly_stats.activity_relative')
    x_axis_label = i18n.get('monthly_stats.x_axis')
    y_axis_label = i18n.get('monthly_stats.y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(14, 6))
    
    # Set up bar positions
    bar_width = 0.35
    x_pos = np.arange(len(days))
    
    # Create bars
    bars1 = ax.bar(x_pos - bar_width/2, real_data, bar_width, 
                   label=label_real, color='#dc3545', alpha=0.8)
    bars2 = ax.bar(x_pos + bar_width/2, relative_data, bar_width,
                   label=label_relative, color='#28a745', alpha=0.8)
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(days)
    ax.set_ylim(bottom=0)
    ax.grid(True, alpha=0.3, linestyle='--', axis='y')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title and subtitle
    title = f'Haloaktivität im {month_name} {year}'
    subtitle = f'berechnet aus {observation_count} Einzelbeobachtungen'
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    ax.text(0.5, 1.02, subtitle, transform=ax.transAxes, 
            ha='center', va='bottom', fontsize=10, style='italic')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.96])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _generate_annual_stats_chart(data: Dict[str, Any], jj: int, i18n) -> bytes:
    """Generate annual activity chart as PNG image using matplotlib.
    
    Creates a line chart with:
    - Red line: Real activity (normalized)
    - Green line: Relative activity (normalized)
    - Months 1-12 on x-axis
    - Title with year
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - months 1-12
    months = list(range(1, 13))
    real_data = [data.get('monthly_stats', {}).get(str(m), {}).get('real', 0) for m in months]
    relative_data = [data.get('monthly_stats', {}).get(str(m), {}).get('relative', 0) for m in months]
    
    # Get month names and year for labels
    month_labels = [i18n.get(f'months.{m}')[:3] for m in months]  # Use first 3 chars (Jan, Feb, etc.)
    year = f"19{str(jj).zfill(2)}" if jj >= 50 else f"20{str(jj).zfill(2)}"
    
    # Get labels from i18n
    label_real = i18n.get('annual_stats.chart_real')
    label_relative = i18n.get('annual_stats.chart_relative')
    x_axis_label = i18n.get('annual_stats.chart_x_axis')
    y_axis_label = i18n.get('annual_stats.chart_y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Create smooth spline interpolation (like Chart.js tension: 0.4)
    months_smooth = np.linspace(1, 12, 120)  # 120 points for smooth curve
    
    # Smooth interpolation for real data
    if max(real_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        real_smooth = np.interp(months_smooth, months, real_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        real_smooth = np.convolve(real_smooth, kernel, mode='same')
        real_smooth = np.maximum(real_smooth, 0)  # Clip to [0, inf)
        ax.plot(months_smooth, real_smooth, color='#dc3545', linewidth=2, label=label_real)
    else:
        ax.plot(months, real_data, color='#dc3545', linewidth=2, label=label_real)
    
    # Smooth interpolation for relative data
    if max(relative_data) > 0:  # Only if there's data
        # Use numpy cubic interpolation
        relative_smooth = np.interp(months_smooth, months, relative_data)
        # Apply smoothing via convolution for visual effect
        kernel_size = 9
        kernel = np.ones(kernel_size) / kernel_size
        relative_smooth = np.convolve(relative_smooth, kernel, mode='same')
        relative_smooth = np.maximum(relative_smooth, 0)  # Clip to [0, inf)
        ax.plot(months_smooth, relative_smooth, color='#28a745', linewidth=2, label=label_relative)
    else:
        ax.plot(months, relative_data, color='#28a745', linewidth=2, label=label_relative)
    
    # Add data points as markers
    ax.plot(months, real_data, 'o', color='#dc3545', markersize=4, markerfacecolor='#dc3545')
    ax.plot(months, relative_data, 'o', color='#28a745', markersize=4, markerfacecolor='#28a745')
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xlim(0.5, 12.5)
    ax.set_ylim(bottom=0)
    ax.set_xticks(months)
    ax.set_xticklabels(month_labels)
    ax.grid(True, alpha=0.3, linestyle='--')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title
    title_template = i18n.get('annual_stats.chart_title')
    title = title_template.replace('{year}', year)
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    
    # Add subtitle with observation count
    total_ee = data.get('totals', {}).get('total_ee', 0)
    subtitle = f'berechnet aus {total_ee} Einzelbeobachtungen'
    fig.text(0.5, 0.91, subtitle, ha='center', fontsize=10, color='#666')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.89])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _generate_annual_stats_bar_chart(data: Dict[str, Any], jj: int, i18n) -> bytes:
    """Generate annual activity bar chart as PNG image using matplotlib.
    
    Creates a bar chart with:
    - Two side-by-side bars for each month: red (real) and green (relative)
    - Months 1-12 on x-axis
    - Title with year
    
    Returns:
        bytes: PNG image data
    """
    # Prepare data - months 1-12
    months = list(range(1, 13))
    real_data = [data.get('monthly_stats', {}).get(str(m), {}).get('real', 0) for m in months]
    relative_data = [data.get('monthly_stats', {}).get(str(m), {}).get('relative', 0) for m in months]
    
    # Get month names and year for labels
    month_labels = [i18n.get(f'months.{m}')[:3] for m in months]  # Use first 3 chars (Jan, Feb, etc.)
    year = f"19{str(jj).zfill(2)}" if jj >= 50 else f"20{str(jj).zfill(2)}"
    
    # Get labels from i18n
    label_real = i18n.get('annual_stats.chart_real')
    label_relative = i18n.get('annual_stats.chart_relative')
    x_axis_label = i18n.get('annual_stats.chart_x_axis')
    y_axis_label = i18n.get('annual_stats.chart_y_axis')
    
    # Create figure and axis
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Set up bar positions
    bar_width = 0.35
    x_pos = np.arange(len(months))
    
    # Create bars
    bars1 = ax.bar(x_pos - bar_width/2, real_data, bar_width,
                   label=label_real, color='#dc3545', alpha=0.8)
    bars2 = ax.bar(x_pos + bar_width/2, relative_data, bar_width,
                   label=label_relative, color='#28a745', alpha=0.8)
    
    # Configure axes
    ax.set_xlabel(x_axis_label, fontsize=12, fontweight='bold')
    ax.set_ylabel(y_axis_label, fontsize=12, fontweight='bold')
    ax.set_xticks(x_pos)
    ax.set_xticklabels(month_labels)
    ax.set_ylim(bottom=0)
    ax.grid(True, alpha=0.3, linestyle='--', axis='y')
    
    # Add legend
    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    
    # Add title and subtitle
    title_template = i18n.get('annual_stats.chart_title')
    title = title_template.replace('{year}', year)
    fig.suptitle(title, fontsize=14, fontweight='bold', y=0.98)
    
    # Add subtitle with observation count
    total_ee = data.get('totals', {}).get('total_ee', 0)
    subtitle = f'berechnet aus {total_ee} Einzelbeobachtungen'
    ax.text(0.5, 1.02, subtitle, transform=ax.transAxes, 
            ha='center', va='bottom', fontsize=10, style='italic')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout(rect=[0, 0, 1, 0.96])
    
    # Save to bytes buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    plt.close(fig)
    buf.seek(0)
    
    return buf.read()


def _format_annual_stats_text(data: Dict[str, Any], year: str, i18n) -> str:
    """Format annual statistics as pseudographic text with box-drawing characters.
    
    Ported from client-side JavaScript rendering functions in annual_stats.js:
    - renderObserverDistribution()
    - renderEEObservations()
    - renderEETable()
    - renderPhenomena()
    - renderMonthlyActivity()
    """
    lines = []
    
    # ============================================================================
    # Main Title
    # ============================================================================
    title = i18n.get('annual_stats.title', 'Jahresübersicht') + ' ' + year
    title_padding = max(0, (73 - len(title)) // 2)
    lines.append(' ' * title_padding + title)
    lines.append(' ' * title_padding + '═' * len(title))
    lines.append('')
    
    # ============================================================================
    # Section 1: Monthly Activity Table (FIRST!)
    # ============================================================================
    monthly_stats = data.get('monthly_stats', {})
    totals = data.get('totals', {})
    
    if monthly_stats:
        lines.append('╔═══════════╦══════════════╦══════════════╦══════════════╦══════════════╗')
        lines.append('║           ║     ' + i18n.get('annual_stats.table_sun', 'Sonne').ljust(9)[:9] + '║     ' + i18n.get('annual_stats.table_moon', 'Mond').ljust(9)[:9] + '║    ' + i18n.get('annual_stats.table_total', 'Gesamt').ljust(10)[:10] + '║  ' + i18n.get('annual_stats.table_activity', 'Aktivität').ljust(11)[:11] +  ' ║')
        lines.append('║   ' + i18n.get('annual_stats.table_month', 'Monat').ljust(8)[:8] + '║   ' + i18n.get('annual_stats.table_ee', 'EE') + '   ' + i18n.get('annual_stats.table_days', 'Tg') + '  ║   ' + i18n.get('annual_stats.table_ee', 'EE') + '   ' + i18n.get('annual_stats.table_days', 'Tg') + '  ║   ' + i18n.get('annual_stats.table_ee', 'EE') + '   ' + i18n.get('annual_stats.table_days', 'Tg') + '  ║  ' + i18n.get('annual_stats.table_real', 'real').ljust(6)[:6] + i18n.get('annual_stats.table_relative', 'rel').ljust(5)[:5] + ' ║')
        lines.append('╠═══════════╬══════════════╬══════════════╬══════════════╬══════════════╣')
        
        # 12 month rows
        for m in range(1, 13):
            month_key = str(m)
            month_data = monthly_stats.get(month_key, {})
            month_name = i18n.get(f'months.{m}', f'M{m}')
            
            sun_ee = month_data.get('sun_ee', 0)
            sun_days = month_data.get('sun_days', 0)
            moon_ee = month_data.get('moon_ee', 0)
            moon_days = month_data.get('moon_days', 0)
            total_ee = month_data.get('total_ee', 0)
            total_days = month_data.get('total_days', 0)
            real_activity = month_data.get('real', 0.0)
            relative_activity = month_data.get('relative', 0.0)
            
            row = f"║ {month_name.ljust(9)[:9]} ║  {sun_ee:4d}  {sun_days:3d}   ║  {moon_ee:4d}  {moon_days:3d}   ║  {total_ee:4d}  {total_days:3d}   ║ {real_activity:6.1f} {relative_activity:5.1f} ║"
            lines.append(row)
        
        # Totals row with separator
        lines.append('╠═══════════╬══════════════╬══════════════╬══════════════╬══════════════╣')
        
        total_sun_ee = totals.get('sun_ee', 0)
        total_sun_days = totals.get('sun_days', 0)
        total_moon_ee = totals.get('moon_ee', 0)
        total_moon_days = totals.get('moon_days', 0)
        total_total_ee = totals.get('total_ee', 0)
        total_total_days = totals.get('total_days', 0)
        total_real = totals.get('real', 0.0)
        total_relative = totals.get('relative', 0.0)
        
        totals_label = i18n.get('annual_stats.table_totals', 'Gesamt')
        totals_row = f"║ {totals_label.ljust(9)[:9]} ║  {total_sun_ee:4d}  {total_sun_days:3d}   ║  {total_moon_ee:4d}  {total_moon_days:3d}   ║  {total_total_ee:4d}  {total_total_days:3d}   ║ {total_real:6.1f} {total_relative:5.1f} ║"
        lines.append(totals_row)
        
        # Bottom border
        lines.append('╚═══════════╩══════════════╩══════════════╩══════════════╩══════════════╝')
        lines.append('')
    
    # ============================================================================
    # Section 2: Observer Distribution
    # ============================================================================
    observer_data = data.get('observer_distribution', [])
    if observer_data:
        title_line = i18n.get('annual_stats.observer_dist_title', 'Beobachter EE-Verteilung')
        title_padding = max(0, (73 - len(title_line)) // 2)
        lines.append(' ' * title_padding + title_line)
        lines.append(' ' * title_padding + '═' * len(title_line))
        lines.append('')
        
        # Table header - top border
        lines.append('╔══╦═════╦══════╦═════╦══════╦═════╦══════╦═════╦══════╦═════╦═════╦══════╗')
        
        # Header row
        header = '║' + i18n.get('annual_stats.observer_dist_kk', ' KK').ljust(2)[:2] + '║'
        header += i18n.get('annual_stats.observer_dist_ee01', 'EE01').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent', '%').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee02', 'EE02').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent', '%').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee03', 'EE03').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent', '%').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee567', 'EE567').ljust(5)[:5] + '║'
        header += '   ' + i18n.get('annual_stats.observer_dist_percent', '%').ljust(3)[:3] + '║'
        header += i18n.get('annual_stats.observer_dist_ee17', 'EE1-7').ljust(5)[:5] + '║'
        header += i18n.get('annual_stats.observer_dist_ee_so', 'EE(So)').ljust(5)[:5] + '║'
        header += i18n.get('annual_stats.observer_dist_ht_ges', 'HT(G)').ljust(6)[:6] + '║'
        lines.append(header)
        
        # Header separator
        lines.append('╠══╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬═════╬══════╣')
        
        # Data rows with separators every 5 rows
        for i, obs in enumerate(observer_data):
            row = '║' + str(obs['kk']).zfill(2) + '║'
            row += str(obs['ee01']).rjust(4) + ' ║'
            row += str(round(obs['pct01'], 1)).rjust(5) + ' ║'
            row += str(obs['ee02']).rjust(4) + ' ║'
            row += str(round(obs['pct02'], 1)).rjust(5) + ' ║'
            row += str(obs['ee03']).rjust(4) + ' ║'
            row += str(round(obs['pct03'], 1)).rjust(5) + ' ║'
            row += str(obs['ee567']).rjust(4) + ' ║'
            row += str(round(obs['pct567'], 1)).rjust(5) + ' ║'
            row += str(obs['ee17']).rjust(4) + ' ║'
            row += str(obs['total_sun_ee']).rjust(4) + ' ║'
            row += str(obs['total_days']).rjust(5) + ' ║'
            lines.append(row)
            
            # Add separator line every 5 rows (except last row)
            if (i + 1) % 5 == 0 and i < len(observer_data) - 1:
                lines.append('╠══╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬══════╬═════╬═════╬══════╣')
        
        # Bottom border
        lines.append('╚══╩═════╩══════╩═════╩══════╩═════╩══════╩═════╩══════╩═════╩═════╩══════╝')
        lines.append('')
    
    # ============================================================================
    # Section 3: EE Observations (Sun and Moon)
    # ============================================================================
    sun_ee_counts = data.get('sun_ee_counts', {})
    moon_ee_counts = data.get('moon_ee_counts', {})
    
    if sun_ee_counts or moon_ee_counts:
        title_line = i18n.get('annual_stats.ee_observed_title', 'EE-Beobachtungen')
        title_padding = max(0, (73 - len(title_line)) // 2)
        lines.append(' ' * title_padding + title_line)
        lines.append(' ' * title_padding + '═' * len(title_line))
        lines.append('')
        
        # Sun halos table
        if sun_ee_counts:
            lines.append(_format_ee_table(i18n.get('annual_stats.ee_sun_label', 'Sonne'), sun_ee_counts, i18n))
            lines.append('')
        
        # Moon halos table
        if moon_ee_counts:
            lines.append(_format_ee_table(i18n.get('annual_stats.ee_moon_label', 'Mond'), moon_ee_counts, i18n))
            lines.append('')
    
    # ============================================================================
    # Section 4: Phenomena (observations with 5+ EE types marked with '*')
    # ============================================================================
    phenomena_list = data.get('phenomena', [])
    lines.append('')
    title_line = i18n.get('annual_stats.phenomena_title', 'Seltene Beobachtungen')
    title_padding = max(0, (74 - len(title_line)) // 2)
    lines.append(' ' * title_padding + title_line)
    lines.append(' ' * title_padding + '═' * len(title_line))
    
    if not phenomena_list:
        lines.append('')
        phenomena_none_text = i18n.get('annual_stats.phenomena_none', 'Keine besonderen Beobachtungen')
        # Center relative to title, not fixed width
        phenomena_padding = max(0, (len(title_line) - len(phenomena_none_text)) // 2 + title_padding)
        lines.append(' ' * phenomena_padding + phenomena_none_text)
    else:
        lines.append('╔═══════╦═══════╦═════════╦═══╦══════════════════════════════════════════╗')
        
        # Header row - calculate column widths dynamically from border structure
        # Column widths: Date=7, Observer=7, Time=9, O=3, EE=46
        date_text = i18n.get('annual_stats.phenomena_date')
        time_text = i18n.get('annual_stats.phenomena_time')
        other_ee_text = i18n.get('annual_stats.phenomena_other_ee')
        
        header = '║ ' + date_text.ljust(5) + ' ║ KK GG ║ '
        header += time_text.ljust(7) + ' ║ O ║ '
        header += '01 02 03 05 06 07 08 09 11 12 ' + other_ee_text
        while len(header) < 73:
            header += ' '
        header += '║'
        lines.append(header)
        
        # Separator after header
        lines.append('╠═══════╬═══════╬═════════╬═══╬══════════════════════════════════════════╣')
        
        last_month = None
        
        for phenom in phenomena_list:
            # Add month separator if month changed
            if last_month is not None and phenom['mm'] != last_month:
                lines.append('╠═══════╬═══════╬═════════╬═══╬══════════════════════════════════════════╣')
            last_month = phenom['mm']
            
            # Format date: DD.MM
            date_str = f"{phenom['tt']:02d}.{phenom['mm']:02d}"
            
            # Format observer: KK GG
            kkgg = f"{phenom['kk']:02d} {phenom['gg']:02d}"
            
            # Format time: HHh MMm
            time_str = f"{phenom['zs']:2d}h {phenom['zm']:02d}m"
            
            # Object (1 or 2)
            o_str = str(phenom['o'])
            
            # Build data row
            row = f"║ {date_str} ║ {kkgg} ║ {time_str} ║ {o_str} ║"
            
            # EE types 01-12 (show X where present)
            ee12 = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12]
            for ee in ee12:
                if ee in phenom.get('ee_types', []):
                    row += ' X '
                else:
                    row += '   '
            
            # Further EE (beyond 12) - split into groups of 4
            further_ee = sorted([ee for ee in phenom.get('ee_types', []) if ee > 12])
            further_ee_str = [f"{ee:02d}" for ee in further_ee]
            
            if len(further_ee_str) <= 4:
                # All fit on one line
                row += ' '.join(further_ee_str)
                while len(row) < 73:
                    row += ' '
                row += '║'
                lines.append(row)
            else:
                # Split into multiple lines (4 EE per line)
                first_group = further_ee_str[:4]
                row += ' '.join(first_group)
                while len(row) < 73:
                    row += ' '
                row += '║'
                lines.append(row)
                
                # Add continuation rows for remaining EE
                idx = 4
                while idx < len(further_ee_str):
                    group = further_ee_str[idx:idx+4]
                    cont_row = '║       ║       ║         ║   ║                              ' + ' '.join(group)
                    while len(cont_row) < 73:
                        cont_row += ' '
                    cont_row += '║'
                    lines.append(cont_row)
                    idx += 4
        
        # Bottom border
        lines.append('╚═══════╩═══════╩═════════╩═══╩══════════════════════════════════════════╝')
    
    lines.append('')
    
    return '\n'.join(lines)



def _format_ee_table(label: str, ee_counts: Dict[int, int], i18n) -> str:
    """Format single EE table (sun or moon) with proper box-drawing characters."""
    lines = []
    
    # Sort EE numbers
    ee_numbers = sorted([int(ee) for ee in ee_counts.keys()])
    
    # Split into rows of 9 EE types (10 columns including header)
    row_size = 9
    start_idx = 0
    
    while start_idx < len(ee_numbers):
        row_ees = ee_numbers[start_idx:start_idx + row_size]
        
        # Top border
        lines.append('   ╔═════════════' + '╦═════' * len(row_ees) + '╗')
        
        # First row: add label
        if start_idx == 0:
            line = '   ║ ' + label.ljust(8)[:8] + 'EE  ║'
        else:
            line = '   ║        EE   ║'
        
        # EE numbers
        for ee in row_ees:
            line += '  ' + str(ee).rjust(2) + ' ║'
        
        lines.append(line)
        
        # Separator line
        lines.append('   ╠═════════════╬' + '═════╬' * (len(row_ees) - 1) + '═════╣')
        
        # Counts
        line = '   ║      ' + i18n.get('annual_stats.ee_count_label', 'Anz.').ljust(7)[:7] + '║'
        for ee in row_ees:
            count = ee_counts.get(ee, 0)
            line += str(count).rjust(4) + ' ║'
        
        lines.append(line)
        
        # Bottom border
        lines.append('   ╚═════════════' + '╩═════' * len(row_ees) + '╝')
        
        start_idx += row_size
        
        # Add spacing between rows (except last)
        if start_idx < len(ee_numbers):
            lines.append('')
    
    return '\n'.join(lines)



def _format_annual_stats_markdown(data: Dict[str, Any], year: str, i18n) -> str:
    """Format annual statistics as markdown tables.
    
    Ported from client-side JavaScript: buildMarkdownAnnualStats()
    """
    lines = []
    
    title = i18n.get('annual_stats.title_with_year', 'Jahresstatistik {year}').replace('{year}', year)
    lines.append(f'# {title}')
    lines.append('')
    
    # ============================================================================
    # Table 1: Monthly Activity
    # ============================================================================
    monthly_stats = data.get('monthly_stats', {})
    totals = data.get('totals', {})
    
    if monthly_stats and totals:
        table_month = i18n.get('annual_stats.table_month', 'Monat')
        table_sun = i18n.get('annual_stats.table_sun', 'Sonne')
        table_moon = i18n.get('annual_stats.table_moon', 'Mond')
        table_total = i18n.get('annual_stats.table_total', 'Gesamt')
        table_days = i18n.get('annual_stats.table_days', 'Tage')
        table_real = i18n.get('annual_stats.table_real', 'real')
        table_relative = i18n.get('annual_stats.table_relative', 'rel.')
        
        lines.append(f'| {table_month} | {table_sun} EE | {table_sun} {table_days} | {table_moon} EE | {table_moon} {table_days} | {table_total} EE | {table_total} {table_days} | {table_real} | {table_relative} |')
        lines.append('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
        
        for mm in range(1, 13):
            mm_str = str(mm)
            month_data = monthly_stats.get(mm_str, {})
            month_name = i18n.get(f'months.{mm}', f'M{mm}')
            
            line = f'| {month_name} | '
            line += f"{month_data.get('sun_ee', 0)} | {month_data.get('sun_days', 0)} | "
            line += f"{month_data.get('moon_ee', 0)} | {month_data.get('moon_days', 0)} | "
            line += f"{month_data.get('total_ee', 0)} | {month_data.get('total_days', 0)} | "
            line += f"{round(month_data.get('real', 0), 1)} | {round(month_data.get('relative', 0), 1)} |"
            lines.append(line)
        
        # Totals row
        line = f'| **{table_total}** | '
        line += f"**{totals.get('sun_ee', 0)}** | **{totals.get('sun_days', 0)}** | "
        line += f"**{totals.get('moon_ee', 0)}** | **{totals.get('moon_days', 0)}** | "
        line += f"**{totals.get('total_ee', 0)}** | **{totals.get('total_days', 0)}** | "
        line += f"**{round(totals.get('real', 0), 1)}** | **{round(totals.get('relative', 0), 1)}** |"
        lines.append(line)
        lines.append('')
    
    # ============================================================================
    # Table 2: EE Observations (Sun and Moon)
    # ============================================================================
    sun_ee_counts = data.get('sun_ee_counts', {})
    moon_ee_counts = data.get('moon_ee_counts', {})
    
    if sun_ee_counts or moon_ee_counts:
        ee_observed_title = i18n.get('annual_stats.ee_observed_title', 'EE-Beobachtungen')
        lines.append(f'## {ee_observed_title}')
        lines.append('')
        
        # Sun halos
        if sun_ee_counts:
            ee_sun_label = i18n.get('annual_stats.ee_sun_label', 'Sonne')
            lines.append(f'### {ee_sun_label}')
            lines.append('')
            
            sun_ees = sorted([int(ee) for ee in sun_ee_counts.keys()])
            header = '| EE |'
            for ee in sun_ees:
                header += f' {ee:02d} |'
            lines.append(header)
            
            separator = '|---|'
            for _ in sun_ees:
                separator += '---:|'
            lines.append(separator)
            
            ee_count_label = i18n.get('annual_stats.ee_count_label', 'Anzahl')
            row = f'| {ee_count_label} |'
            for ee in sun_ees:
                row += f' {sun_ee_counts.get(ee, 0)} |'
            lines.append(row)
            lines.append('')
        
        # Moon halos
        if moon_ee_counts:
            ee_moon_label = i18n.get('annual_stats.ee_moon_label', 'Mond')
            lines.append(f'### {ee_moon_label}')
            lines.append('')
            
            moon_ees = sorted([int(ee) for ee in moon_ee_counts.keys()])
            header = '| EE |'
            for ee in moon_ees:
                header += f' {ee:02d} |'
            lines.append(header)
            
            separator = '|---|'
            for _ in moon_ees:
                separator += '---:|'
            lines.append(separator)
            
            ee_count_label = i18n.get('annual_stats.ee_count_label', 'Anzahl')
            row = f'| {ee_count_label} |'
            for ee in moon_ees:
                row += f' {moon_ee_counts.get(ee, 0)} |'
            lines.append(row)
            lines.append('')
    
    # ============================================================================
    # Table 3: Observer Distribution
    # ============================================================================
    observer_distribution = data.get('observer_distribution', [])
    
    if observer_distribution:
        observer_dist_title = i18n.get('annual_stats.observer_dist_title', 'Beobachter EE-Verteilung')
        lines.append(f'## {observer_dist_title}')
        lines.append('')
        
        observer_dist_kk = i18n.get('annual_stats.observer_dist_kk', 'KK')
        observer_dist_ee01 = i18n.get('annual_stats.observer_dist_ee01', 'EE01')
        observer_dist_ee02 = i18n.get('annual_stats.observer_dist_ee02', 'EE02')
        observer_dist_ee03 = i18n.get('annual_stats.observer_dist_ee03', 'EE03')
        observer_dist_ee567 = i18n.get('annual_stats.observer_dist_ee567', 'EE567')
        observer_dist_ee17 = i18n.get('annual_stats.observer_dist_ee17', 'EE1-7')
        observer_dist_ee_so = i18n.get('annual_stats.observer_dist_ee_so', 'EE(So)')
        observer_dist_ht_ges = i18n.get('annual_stats.observer_dist_ht_ges', 'HT(ges)')
        observer_dist_percent = i18n.get('annual_stats.observer_dist_percent', '%')
        
        header = f'| {observer_dist_kk} | {observer_dist_ee01} | {observer_dist_percent} | '
        header += f'{observer_dist_ee02} | {observer_dist_percent} | {observer_dist_ee03} | '
        header += f'{observer_dist_percent} | {observer_dist_ee567} | {observer_dist_percent} | '
        header += f'{observer_dist_ee17} | {observer_dist_ee_so} | {observer_dist_ht_ges} |'
        lines.append(header)
        lines.append('|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
        
        for obs in observer_distribution:
            row = f"| {obs['kk']:02d} | {obs['ee01']} | {round(obs['pct01'], 1)} | "
            row += f"{obs['ee02']} | {round(obs['pct02'], 1)} | {obs['ee03']} | "
            row += f"{round(obs['pct03'], 1)} | {obs['ee567']} | {round(obs['pct567'], 1)} | "
            row += f"{obs['ee17']} | {obs['total_sun_ee']} | {obs['total_days']} |"
            lines.append(row)
        lines.append('')
    
    # ============================================================================
    # Table 4: Phenomena
    # ============================================================================
    phenomena_list = data.get('phenomena', [])
    phenomena_title = i18n.get('annual_stats.phenomena_title', 'Halophänomene')
    
    if phenomena_list:
        lines.append(f'## {phenomena_title}')
        lines.append('')
        
        phenomena_date = i18n.get('annual_stats.phenomena_date', 'Datum')
        phenomena_time = i18n.get('annual_stats.phenomena_time', 'Zeit')
        phenomena_other_ee = i18n.get('annual_stats.phenomena_other_ee', 'usw.')
        
        header = f'| {phenomena_date} | KK | GG | {phenomena_time} | O |'
        ee_columns = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12]
        for ee in ee_columns:
            header += f' EE{ee:02d} |'
        header += f' {phenomena_other_ee} |'
        lines.append(header)
        
        separator = '|---|---:|---:|---|---:|'
        for _ in ee_columns:
            separator += '---:|'
        separator += '---|'
        lines.append(separator)
        
        for phenom in phenomena_list:
            row = f"| {phenom['tt']:02d}.{phenom['mm']:02d} | {phenom['kk']:02d} | {phenom['gg']:02d} | "
            row += f"{phenom['zs']:2d}h {phenom['zm']:02d}m | {phenom['o']} |"
            
            # EE types 01-12
            for ee in ee_columns:
                if ee in phenom.get('ee_types', []):
                    row += ' X |'
                else:
                    row += ' |'
            
            # Further EE (beyond 12)
            further_ee = sorted([ee for ee in phenom.get('ee_types', []) if ee > 12])
            further_ee_str = ' '.join([f'{ee:02d}' for ee in further_ee])
            row += f' {further_ee_str} |'
            lines.append(row)
        lines.append('')
    else:
        lines.append(f'## {phenomena_title}')
        lines.append('')
        phenomena_none = i18n.get('annual_stats.phenomena_none', 'Keine besonderen Beobachtungen')
        lines.append(phenomena_none)
        lines.append('')
    
    return '\n'.join(lines)



def _format_annual_stats_html(data: Dict[str, Any], year: str, i18n) -> str:
    """Return HTML formatted annual statistics (or just return JSON for client-side rendering)."""
    # For now, return JSON as HTML format indicates client-side rendering
    # This maintains consistency with monthly-stats pattern
    return jsonify(data)


@api_blueprint.route('/annual-stats', methods=['GET'])
def get_annual_stats() -> Dict[str, Any]:
    """Get annual statistics for a given year.
    
    Query parameters:
        jj: Year (2-digit, 50-99 for 1950-2099)
        format: Output format - 'json' (default), 'html', 'text', or 'markdown'
    
    Returns:
        - format=json/html: Dictionary with monthly_stats, totals, observer_distribution, phenomena
        - format=text: Pseudographic output with box-drawing characters
        - format=markdown: Markdown tables for all statistics
    """
    
    # Check if observations are loaded
    observations = current_app.config.get('OBSERVATIONS', [])
    observers = current_app.config.get('OBSERVERS', [])
    active_observers_only = bool(current_app.config.get('ACTIVE_OBSERVERS_ONLY', False))
    
    if not observations:
        return jsonify({'error': 'No observations loaded. Please load a file first.'}), 400
    
    jj = request.args.get('jj', '').strip()
    
    if not jj:
        return jsonify({'error': 'Missing required parameter: jj'}), 400
    
    try:
        jj_int = int(jj)

        # Accept both 2-digit and 4-digit years (1950-2049) and normalize to 2-digit
        if 1950 <= jj_int <= 1999:
            jj_int -= 1900
        elif 2000 <= jj_int <= 2049:
            jj_int -= 2000
        elif jj_int < 0 or jj_int > 99:
            return jsonify({'error': 'Invalid year (0-99 or 1950-2049)'}), 400

    except ValueError:
        return jsonify({'error': 'Invalid numeric parameter'}), 400
    
    # Filter observations for this year (all months)
    filtered_obs = [obs for obs in observations if obs.JJ == jj_int]
    
    # Get all active observers up to end of year
    # Use December of the year as reference (month 12)
    month_year_value = 12 + 13 * jj_int
    
    # Get unique active observers up to this year
    active_observers = {}
    for obs_record in observers:
        kk = obs_record[0]  # Column 0: KK
        seit_str = obs_record[3]  # Column 3: seit (MM/JJ format)
        aktiv_str = obs_record[4]  # Column 4: aktiv (0 or 1)
        
        # Parse seit from "MM/JJ" to integer MMJJ
        seit = _parse_seit(seit_str) if seit_str else 0
        
        # Parse aktiv to integer
        try:
            aktiv = int(aktiv_str) if aktiv_str else 0
        except (ValueError, TypeError):
            aktiv = 0
        
        # Observer is active if:
        # 1. They started before or during this year (seit <= month_year_value)
        # 2. If active_observers_only is True, they must be marked as active (aktiv == 1)
        if seit <= month_year_value:
            if not active_observers_only or aktiv == 1:
                # Keep the most recent record for each KK
                if kk not in active_observers or seit > _parse_seit(active_observers[kk][3]):
                    active_observers[kk] = obs_record
    
    # Calculate statistics per month using deduplication algorithm
    # Prevents double counting: each observer (KK) can only count each halo type (EE) once per day
    # Only EE=4 (both 22° parhelia) splits into EE=2 + EE=3
    monthly_stats = {}
    
    # Track counts per individual EE type across all months
    sun_ee_counts = {}  # {ee: count}
    moon_ee_counts = {}  # {ee: count}
    
    for mm in range(1, 13):
        month_obs = [obs for obs in filtered_obs if obs.MM == mm]
        
        # Sort observations by day for efficient processing
        month_obs.sort(key=lambda o: (o.TT, o.KK, o.O, o.EE))
        
        # Track which (observer, object, halo_type) combinations have been counted each day
        # Key: (day, observer_KK, object_O, halo_EE) -> prevents double counting
        counted_today = set()
        last_day = -1
        
        sun_ee_count = 0
        moon_ee_count = 0
        sun_days_set = set()
        moon_days_set = set()
        total_days_set = set()
        
        for obs in month_obs:
            # Reset tracking when day changes
            if obs.TT != last_day:
                last_day = obs.TT
                counted_today = set()
            
            # Handle EE=4 (both 22° parhelia) - splits into EE=2 + EE=3
            halos_to_count = []
            if obs.EE == 4:
                # EE=4 splits into EE=2 (left parhelion) and EE=3 (right parhelion)
                # Check if EE=2 hasn't been counted yet
                if (obs.TT, obs.KK, obs.O, 2) not in counted_today:
                    halos_to_count.append(2)
                    counted_today.add((obs.TT, obs.KK, obs.O, 2))
                # Check if EE=3 hasn't been counted yet
                if (obs.TT, obs.KK, obs.O, 3) not in counted_today:
                    halos_to_count.append(3)
                    counted_today.add((obs.TT, obs.KK, obs.O, 3))
            else:
                # Normal halo type - check if not yet counted for this observer today
                if (obs.TT, obs.KK, obs.O, obs.EE) not in counted_today:
                    halos_to_count.append(obs.EE)
                    counted_today.add((obs.TT, obs.KK, obs.O, obs.EE))
            
            # Count only if this observation adds new halo types
            if halos_to_count:
                count_increment = len(halos_to_count)
                
                if obs.O == 1:
                    # Sun halos
                    sun_ee_count += count_increment
                    sun_days_set.add((obs.TT, obs.MM))
                    total_days_set.add((obs.TT, obs.MM))
                    # Track individual EE counts
                    for ee in halos_to_count:
                        sun_ee_counts[ee] = sun_ee_counts.get(ee, 0) + 1
                elif obs.O == 2:
                    # Moon halos
                    moon_ee_count += count_increment
                    moon_days_set.add((obs.TT, obs.MM))
                    total_days_set.add((obs.TT, obs.MM))
                    # Track individual EE counts
                    for ee in halos_to_count:
                        moon_ee_counts[ee] = moon_ee_counts.get(ee, 0) + 1
        
        sun_days = len(sun_days_set)
        moon_days = len(moon_days_set)
        total_days = len(total_days_set)
        total_ee_count = sun_ee_count + moon_ee_count
        
        # Get sun observations for activity calculation
        sun_obs = [obs for obs in month_obs if obs.O == 1]
        
        # Calculate activity
        activity_data = calculate_halo_activity(
            observations=sun_obs,  # Activity calculation typically based on sun observations
            observers=active_observers,
            mm=mm,
            jj=jj_int,
            active_observers_only=active_observers_only
        )
        
        # Apply 30-day normalization for this month (Pascal: aktf[mm] * 30 / tprom[mm])
        # This ensures activity values are comparable across months of different lengths
        days_in_month = get_days_in_month(mm, jj_int)
        normalization_factor = 30.0 / days_in_month
        normalized_real = round(activity_data['total_real'] * normalization_factor, 1)
        normalized_relative = round(activity_data['total_relative'] * normalization_factor, 1)
        
        # Use string keys for JSON serialization
        monthly_stats[str(mm)] = {
            'sun_ee': sun_ee_count,
            'sun_days': sun_days,
            'moon_ee': moon_ee_count,
            'moon_days': moon_days,
            'total_ee': total_ee_count,
            'total_days': total_days,
            'real': normalized_real,
            'relative': normalized_relative
        }
    
    # Calculate totals (using string keys) with rounded values
    totals = {
        'sun_ee': sum(monthly_stats[str(mm)]['sun_ee'] for mm in range(1, 13)),
        'sun_days': sum(monthly_stats[str(mm)]['sun_days'] for mm in range(1, 13)),
        'moon_ee': sum(monthly_stats[str(mm)]['moon_ee'] for mm in range(1, 13)),
        'moon_days': sum(monthly_stats[str(mm)]['moon_days'] for mm in range(1, 13)),
        'total_ee': sum(monthly_stats[str(mm)]['total_ee'] for mm in range(1, 13)),
        'total_days': sum(monthly_stats[str(mm)]['total_days'] for mm in range(1, 13)),
        'real': round(sum(monthly_stats[str(mm)]['real'] for mm in range(1, 13)), 1),
        'relative': round(sum(monthly_stats[str(mm)]['relative'] for mm in range(1, 13)), 1)
    }
    
    # Calculate per-observer EE distribution (EE 01, 02, 03, 05-07)
    # Track for each observer: counts of EE 01, 02, 03, 05, 06, 07 and total sun EE
    observer_stats = {}
    
    # First pass: initialize observer stats and count total days (sun + moon)
    for obs in filtered_obs:
        kk = obs.KK
        if kk not in observer_stats:
            observer_stats[kk] = {
                'ee01': 0, 'ee02': 0, 'ee03': 0, 'ee567': 0,
                'total_sun_ee': 0, 'sun_days': set(), 'total_days': set()
            }
        # Track all halo days (sun and moon) for total_days
        observer_stats[kk]['total_days'].add((obs.MM, obs.TT))
    
    # Now count sun halos with deduplication
    filtered_obs.sort(key=lambda o: (o.MM, o.TT, o.KK, o.O, o.EE))
    counted_per_observer = {}  # {kk: {(day, ee): counted}}
    
    for obs in filtered_obs:
        if obs.O != 1:  # Only sun halos for EE distribution
            continue
        
        kk = obs.KK
        if kk not in counted_per_observer:
            counted_per_observer[kk] = {}
        
        # Track per day for this observer (use month+day to make unique across year)
        day_key = (obs.MM, obs.TT)
        
        # Handle EE=4 splitting
        halos_to_count = []
        if obs.EE == 4:
            if (day_key, 2) not in counted_per_observer[kk]:
                halos_to_count.append(2)
                counted_per_observer[kk][(day_key, 2)] = True
            if (day_key, 3) not in counted_per_observer[kk]:
                halos_to_count.append(3)
                counted_per_observer[kk][(day_key, 3)] = True
        else:
            if (day_key, obs.EE) not in counted_per_observer[kk]:
                halos_to_count.append(obs.EE)
                counted_per_observer[kk][(day_key, obs.EE)] = True
        
        # Count for this observer
        for ee in halos_to_count:
            observer_stats[kk]['total_sun_ee'] += 1
            
            if ee == 1:
                observer_stats[kk]['ee01'] += 1
            elif ee == 2:
                observer_stats[kk]['ee02'] += 1
            elif ee == 3:
                observer_stats[kk]['ee03'] += 1
            elif ee in [5, 6, 7]:
                observer_stats[kk]['ee567'] += 1
        
        # Track sun halo days only
        if halos_to_count:
            observer_stats[kk]['sun_days'].add((obs.MM, obs.TT))
    
    # Convert sets to counts and calculate EE1-7
    observer_distribution = []
    for kk in sorted(observer_stats.keys()):
        stats = observer_stats[kk]
        ee17 = stats['ee01'] + stats['ee02'] + stats['ee03'] + stats['ee567']
        
        # Calculate percentages (relative to EE1-7)
        if ee17 > 0:
            pct01 = (stats['ee01'] / ee17) * 100.0
            pct02 = (stats['ee02'] / ee17) * 100.0
            pct03 = (stats['ee03'] / ee17) * 100.0
            pct567 = (stats['ee567'] / ee17) * 100.0
        else:
            pct01 = pct02 = pct03 = pct567 = 0.0
        
        observer_distribution.append({
            'kk': kk,
            'ee01': stats['ee01'],
            'pct01': pct01,
            'ee02': stats['ee02'],
            'pct02': pct02,
            'ee03': stats['ee03'],
            'pct03': pct03,
            'ee567': stats['ee567'],
            'pct567': pct567,
            'ee17': ee17,
            'total_sun_ee': stats['total_sun_ee'],
            'sun_days': len(stats['sun_days']),
            'total_days': len(stats['total_days'])
        })
    
    # Calculate phenomena (observations with 5+ EE types visible simultaneously)
    # Group by unique (MM, TT, KK, O) combination
    phenomena_dict = {}  # Key: (MM, TT, KK, O), Value: phenomenon data
    
    for obs in filtered_obs:
        # Group by (MM, TT, KK, O)
        key = (obs.MM, obs.TT, obs.KK, obs.O)
        if key not in phenomena_dict:
            phenomena_dict[key] = {
                'mm': obs.MM,
                'tt': obs.TT,
                'kk': obs.KK,
                'gg': obs.GG,
                'zs': obs.ZS,
                'zm': obs.ZM,
                'o': obs.O,
                'ee_types': set(),
                'ee_count': 0  # Track count of EE types
            }
        
        # Add EE type (split if EE=4) and update count
        ee_before = len(phenomena_dict[key]['ee_types'])
        if obs.EE == 4:
            phenomena_dict[key]['ee_types'].add(2)
            phenomena_dict[key]['ee_types'].add(3)
        else:
            phenomena_dict[key]['ee_types'].add(obs.EE)
        
        ee_after = len(phenomena_dict[key]['ee_types'])
        phenomena_dict[key]['ee_count'] = ee_after
        
        # Update time only if count < 6 (freeze time after 5th EE type confirmed)
        if ee_after < 6:
            phenomena_dict[key]['zs'] = obs.ZS
            phenomena_dict[key]['zm'] = obs.ZM
    
    # Filter for only phenomena with 5+ EE types and convert to sorted list
    phenomena_list = []
    for key in sorted(phenomena_dict.keys()):
        phenom = phenomena_dict[key]
        if phenom['ee_count'] >= 5:  # Only include if 5 or more EE types
            phenom['ee_types'] = sorted(list(phenom['ee_types']))
            phenomena_list.append(phenom)
    
    # Sort by (MM, TT, KK, time)
    phenomena_list.sort(key=lambda p: (p['mm'], p['tt'], p['kk'], p['zs'], p['zm']))
    
    # Build data structure for formatting
    data = {
        'jj': jj_int,
        'monthly_stats': monthly_stats,
        'totals': totals,
        'observer_count': len(active_observers),
        'sun_ee_counts': sun_ee_counts,
        'moon_ee_counts': moon_ee_counts,
        'observer_distribution': observer_distribution,
        'phenomena': phenomena_list
    }
    
    # Check requested format
    output_format = request.args.get('format', 'json').lower()
    i18n = get_i18n()
    
    if output_format in ['json', 'html']:
        # JSON format and HTML format both return data; HTML is formatted client-side
        return jsonify(data)
    elif output_format in ['text', 'markdown']:
        # Get formatted year for display
        year = f"19{str(jj_int).zfill(2)}" if jj_int >= 50 else f"20{str(jj_int).zfill(2)}"
        if output_format == 'text':
            content = _format_annual_stats_text(data, year, i18n)
            return Response(content, mimetype='text/plain; charset=utf-8')
        elif output_format == 'markdown':
            content = _format_annual_stats_markdown(data, year, i18n)
            return Response(content, mimetype='text/markdown; charset=utf-8')
    elif output_format == 'linegraph':
        # Generate PNG line chart
        img_data = _generate_annual_stats_chart(data, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    elif output_format == 'bargraph':
        # Generate PNG bar chart
        img_data = _generate_annual_stats_bar_chart(data, jj_int, i18n)
        return Response(img_data, mimetype='image/png')
    else:
        return jsonify({'error': f'Invalid format: {output_format}. Use json, text, markdown, linegraph, or bargraph.'}), 400



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
    
    observers = current_app.config.get('OBSERVERS', [])
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
            
            # Handle century boundary for observation year (same as _parse_seit)
            # Years 00-49 are treated as 2000-2049, so add 100 to year
            if jj < 50:
                jj += 100
            
            # Calculate seit value for observation date: month + 13 × year
            obs_seit = mm + 13 * jj
            
            # Find all records for this observer
            kk_records = [obs for obs in observers if obs[0] == kk_param]
            
            if kk_records:
                # Find the latest record where seit <= observation date
                valid_records = [obs for obs in kk_records if obs[3] and _parse_seit(obs[3]) <= obs_seit]
                
                for i, obs in enumerate(kk_records):
                    parsed_seit = _parse_seit(obs[3]) if obs[3] else None
                
                if valid_records:
                    # Get the record with the latest seit value
                    latest_record = max(valid_records, key=lambda obs: _parse_seit(obs[3]))
                    
                    # Return single observer with GH and GN
                    result = {
                        'KK': latest_record[0],
                        'VName': latest_record[1],
                        'NName': latest_record[2],
                        'seit': latest_record[3],
                        'aktiv': latest_record[4],
                        'HbOrt': latest_record[5],
                        'GH': latest_record[6],
                        'GN': latest_record[14]
                    }
                    return jsonify({'observer': result})
            
            # If no matching record found, return empty
            return jsonify({'observer': None})
        except (ValueError, IndexError) as e:
            return jsonify({'error': f'Invalid parameters: {e}'}), 400
    
    if filter_type == 'none':
        # Return all observers
        filtered = observers
    elif filter_type == 'kk':
        # Filter by observer ID (KK field is at index 0)
        filtered = [obs for obs in observers if len(obs) >= 21 and obs[0] == filter_value]
    elif filter_type == 'site':
        # Filter by observation site (HbOrt at index 5, NbOrt at index 13)
        search_term = filter_value.lower()
        filtered = [obs for obs in observers 
                   if len(obs) >= 21 and (search_term in obs[5].lower() or search_term in obs[13].lower())]
    elif filter_type == 'region':
        # Filter by geographic region (GH at index 6, GN at index 14)
        filtered = [obs for obs in observers 
                   if len(obs) >= 21 and (str(obs[6]) == filter_value or str(obs[14]) == filter_value)]
    else:
        filtered = [obs for obs in observers if len(obs) >= 21]
    
    # Filter to latest site only if requested
    if latest_only:
        # Group by KK and keep only the record with the latest 'seit' date
        latest_sites = {}
        for obs in filtered:
            # Skip entries that don't have enough columns
            if len(obs) < 21:
                continue
                
            kk = obs[0]
            seit = obs[3]  # seit field in MM/YY format
            
            # Parse seit (MM/YY) to compare dates
            try:
                month, year = map(int, seit.split('/'))
                # Convert to full year (assume 20xx for years < 50, 19xx otherwise)
                full_year = 2000 + year if year < 50 else 1900 + year
                date_key = (full_year, month)
                
                if kk not in latest_sites or date_key > latest_sites[kk][1]:
                    latest_sites[kk] = (obs, date_key)
            except (ValueError, AttributeError):
                # If date parsing fails, keep the record
                if kk not in latest_sites:
                    latest_sites[kk] = (obs, (0, 0))
        
        filtered = [obs_tuple[0] for obs_tuple in latest_sites.values()]
    
    # Convert to dict format for JSON
    result = []
    for obs in filtered:
        # Skip entries that don't have enough columns
        if len(obs) < 21:
            continue
            
        result.append({
            'KK': obs[0],
            'VName': obs[1],
            'NName': obs[2],
            'seit': obs[3],
            'aktiv': obs[4],
            'HbOrt': obs[5],
            'GH': obs[6],
            'HLG': obs[7],
            'HLM': obs[8],
            'HOW': obs[9],
            'HBG': obs[10],
            'HBM': obs[11],
            'HNS': obs[12],
            'NbOrt': obs[13],
            'GN': obs[14],
            'NLG': obs[15],
            'NLM': obs[16],
            'NOW': obs[17],
            'NBG': obs[18],
            'NBM': obs[19],
            'NNS': obs[20]
        })
    
    return jsonify({'observers': result, 'count': len(result)})


@api_blueprint.route('/observers/list', methods=['GET'])
def get_observers_list() -> Dict[str, Any]:
    """Get list of unique observers (KK + Name) for dropdown."""
    
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Get unique observers by KK
    unique_observers = {}
    for obs in observers:
        # Skip entries that don't have enough columns
        if len(obs) < 21:
            continue
            
        kk = obs[0]
        vname = obs[1] if len(obs) > 1 and obs[1] else ''
        nname = obs[2] if len(obs) > 2 and obs[2] else ''
        
        # Skip if KK is empty or both names are empty
        if not kk or (not vname and not nname):
            continue
            
        if kk not in unique_observers:
            unique_observers[kk] = {
                'KK': kk,
                'VName': vname,
                'NName': nname
            }
    
    # Convert to list and sort by KK
    observer_list = sorted(unique_observers.values(), key=lambda x: x['KK'])
    
    return jsonify({'observers': observer_list})


def _parse_seit(seit_str: str) -> int:
    """Parse 'seit' field from MM/YY format to seit value (month + 13 × year).
    
    Args:
        seit_str: String in format 'MM/YY' (e.g., '01/86', '12/05')
    
    Returns:
        seit value as integer (month + 13 × year)
        
    Note:
        Years 00-49 are treated as 2000-2049 (add 100 to year for formula)
        Years 50-99 are treated as 1950-1999 (use year as-is)
    """
    try:
        parts = seit_str.split('/')
        if len(parts) == 2:
            month = int(parts[0])
            year = int(parts[1])
            
            # Handle century boundary: years 00-49 are 2000+, so add 100 to year
            if year < 50:
                year += 100
            
            return month + 13 * year
    except (ValueError, AttributeError):
        pass
    return 0


@api_blueprint.route('/observers/regions', methods=['GET'])
def get_observer_regions() -> Dict[str, Any]:
    """Get list of unique geographic regions for dropdown."""
    
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Get unique regions
    regions = set()
    for obs in observers:
        # Skip entries that don't have enough columns
        if len(obs) < 21:
            continue
        regions.add(int(obs[6]))  # GH - primary region
        regions.add(int(obs[14]))  # GN - secondary region
    
    # Sort and create list with region numbers
    # TODO: Add region names from a lookup table
    region_list = [{'number': r, 'name': f'Region {r}'} for r in sorted(regions)]
    
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
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Validate KK format (must be 2-digit string between 01 and 99)
    kk = str(data['KK']).zfill(2)
    try:
        kk_int = int(kk)
        if kk_int < 1 or kk_int > 99:
            return jsonify({'error': 'KK must be between 01 and 99'}), 400
    except ValueError:
        return jsonify({'error': 'Invalid KK format'}), 400
    
    # Check if KK already exists (don't allow any duplicate KK at all)
    observers = current_app.config.get('OBSERVERS', [])
    seit_str = f"{int(data['seit_month']):02d}/{int(data['seit_year']) % 100:02d}"
    
    # Check if this KK already exists (any observer with this KK)
    for obs in observers:
        if obs[0] == kk:
            return jsonify({'error': f'Observer code {kk} already exists'}), 400
    
    # Build the CSV row
    # Format: KK,VName,NName,seit,active,HbOrt,GH,HLG,HLM,HOW,HBG,HBM,HNS,NbOrt,GN,NLG,NLM,NOW,NBG,NBM,NNS
    new_row = [
        kk,
        data.get('VName', '')[:15],  # Max 15 chars
        data.get('NName', '')[:15],  # Max 15 chars
        seit_str,
        str(data.get('active', 1)),
        data.get('HbOrt', '')[:20],  # Max 20 chars
        str(data.get('GH', 0)),
        str(data.get('HLG', 0)),
        str(data.get('HLM', 0)),
        data.get('HOW', 'O'),
        str(data.get('HBG', 0)),
        str(data.get('HBM', 0)),
        data.get('HNS', 'N'),
        data.get('NbOrt', '')[:20],  # Max 20 chars
        str(data.get('GN', 0)),
        str(data.get('NLG', 0)),
        str(data.get('NLM', 0)),
        data.get('NOW', 'O'),
        str(data.get('NBG', 0)),
        str(data.get('NBM', 0)),
        data.get('NNS', 'N')
    ]
    
    # Add observer using io module
    try:
        observers = add_observer_record(new_row, observers, save_to_file=True)
        current_app.config['OBSERVERS'] = observers
        
        return jsonify({
            'success': True,
            'message': 'Observer added successfully',
            'observer': {
                'KK': kk,
                'VName': new_row[1],
                'NName': new_row[2],
                'seit': seit_str
            }
        })
    except Exception as e:
        return jsonify({'error': f'Failed to save observer: {str(e)}'}), 500


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
    
    # Validate required fields (only VName and NName are editable in base data)
    required_fields = ['VName', 'NName']
    for field in required_fields:
        if field not in data or data[field] == '':
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Find all observer entries in halobeo.csv with this KK
    observers = current_app.config.get('OBSERVERS', [])
    observer_indices = []
    for idx, obs in enumerate(observers):
        if obs[0] == kk:
            observer_indices.append(idx)
    
    if not observer_indices:
        return jsonify({'error': f'Observer {kk} not found'}), 404
    
    # Update VName and NName for all entries with this KK
    updated_count = 0
    for idx in observer_indices:
        old_observer = observers[idx]
        # Keep all data unchanged except VName and NName
        observers[idx] = [
            kk,  # KK (unchanged)
            data.get('VName', '')[:15],  # VName (updated)
            data.get('NName', '')[:15],  # NName (updated)
            old_observer[3],  # seit (unchanged)
            old_observer[4],  # active (unchanged)
            old_observer[5],  # HbOrt (unchanged)
            old_observer[6],  # GH (unchanged)
            old_observer[7],  # HLG (unchanged)
            old_observer[8],  # HLM (unchanged)
            old_observer[9],  # HOW (unchanged)
            old_observer[10],  # HBG (unchanged)
            old_observer[11],  # HBM (unchanged)
            old_observer[12],  # HNS (unchanged)
            old_observer[13],  # NbOrt (unchanged)
            old_observer[14],  # GN (unchanged)
            old_observer[15],  # NLG (unchanged)
            old_observer[16],  # NLM (unchanged)
            old_observer[17],  # NOW (unchanged)
            old_observer[18],  # NBG (unchanged)
            old_observer[19],  # NBM (unchanged)
            old_observer[20]   # NNS (unchanged)
        ]
        updated_count += 1
    
    # Get the first updated entry for response
    first_updated = observers[observer_indices[0]]
    
    try:
        # Save updated observers
        save_observers(observers)
        current_app.config['OBSERVERS'] = observers
        
        # Update metadata in observation files (if loaded)
        observations = current_app.config.get('OBSERVATIONS', [])
        if observations:
            obs_updated_count = 0
            for obs in observations:
                # Check if observation belongs to this observer
                if getattr(obs, 'KK', None) == kk:
                    obs.VName = first_updated[1]
                    obs.NName = first_updated[2]
                    obs_updated_count += 1
            
            # Mark as dirty if any observations were updated
        
        return jsonify({
            'success': True,
            'message': f'Observer {kk} updated successfully ({updated_count} entries)',
            'observer': {
                'KK': kk,
                'VName': first_updated[1],
                'NName': first_updated[2],
                'seit': first_updated[3],
                'active': int(first_updated[4])
            }
        })
    except Exception as e:
        return jsonify({'error': f'Failed to update observer: {str(e)}'}), 500


@api_blueprint.route('/observers/<kk>/sites', methods=['GET'])
def get_observer_sites(kk):
    """Get all observation site entries for an observer"""
    
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Find all entries for this observer
    # Observers are lists: [KK,VName,NName,seit,active,HbOrt,GH,HLG,HLM,HOW,HBG,HBM,HNS,NbOrt,GN,NLG,NLM,NOW,NBG,NBM,NNS]
    # Indices: 0=KK, 1=VName, 2=NName, 3=seit, 4=active, 5=H_Ort, 6=H_GG, 7=H_LaenGrad, 8=H_LaenMin, 
    #          9=H_EW, 10=H_BreiGrad, 11=H_BreiMin, 12=H_NS, 13=N_Ort, 14=N_GG, 15=N_LaenGrad, 
    #          16=N_LaenMin, 17=N_EW, 18=N_BreiGrad, 19=N_BreiMin, 20=N_NS
    sites = []
    for obs in observers:
        if obs[0] == kk:  # obs[0] is KK
            # Parse seit to month/year
            seit_parts = obs[3].split('/')
            seit_month = int(seit_parts[0])
            seit_year = int(seit_parts[1])
            
            sites.append({
                'KK': obs[0],
                'VName': obs[1],
                'NName': obs[2],
                'seit': obs[3],
                'seit_month': seit_month,
                'seit_year': seit_year,
                'active': int(obs[4]),
                'HbOrt': obs[5],
                'GH': obs[6],
                'HLG': int(obs[7]) if obs[7] else 0,
                'HLM': int(obs[8]) if obs[8] else 0,
                'HOW': obs[9],
                'HBG': int(obs[10]) if obs[10] else 0,
                'HBM': int(obs[11]) if obs[11] else 0,
                'HNS': obs[12],
                'NbOrt': obs[13],
                'GN': obs[14],
                'NLG': int(obs[15]) if obs[15] else 0,
                'NLM': int(obs[16]) if obs[16] else 0,
                'NOW': obs[17],
                'NBG': int(obs[18]) if obs[18] else 0,
                'NBM': int(obs[19]) if obs[19] else 0,
                'NNS': obs[20]
            })
    
    if not sites:
        return jsonify({'error': 'Observer not found'}), 404
    
    return jsonify({'sites': sites})


@api_blueprint.route('/observers/<kk>/active', methods=['GET'])
def check_observer_active(kk):
    """Check if observer was active at a given date (MM/JJ)
    
    Query parameters:
        mm: Month (1-12)
        jj: Year (2-digit: 50-99 = 1950-1999, 0-49 = 2000-2049)
    
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
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Convert jj to 4-digit year for comparison
    year_4digit = (2000 + jj) if jj < 50 else (1900 + jj)
    check_date = year_4digit * 100 + mm
    
    # Find all site entries for this observer where seit <= check_date
    matching_records = []
    for obs in observers:
        if obs[0] == kk:  # obs[0] is KK
            # Parse seit (start date)
            seit_parts = obs[3].split('/')
            seit_month = int(seit_parts[0])
            seit_year = int(seit_parts[1])
            seit_year_4digit = (2000 + seit_year) if seit_year < 50 else (1900 + seit_year)
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
    is_active = int(latest_record[4]) == 1
    
    return jsonify({'active': is_active})


@api_blueprint.route('/observers/<kk>/sites', methods=['POST'])
def add_observer_site(kk):
    """Add a new observation site entry for an observer"""
    data = request.get_json() or {}
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Validate required fields
    required_fields = ['seit_month', 'seit_year', 'active', 'HbOrt', 'HBG', 'HBM', 
                       'HNS', 'HLG', 'HLM', 'HOW', 'GH']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Convert seit_month/seit_year to seit format (MM/YY)
    seit = f"{int(data['seit_month']):02d}/{int(data['seit_year']) % 100:02d}"
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Find an existing entry for this observer to get VName/NName
    # Observers are stored as lists: [KK, VName, NName, seit, active, ...]
    existing = None
    for obs in observers:
        if obs[0] == kk:  # obs[0] is KK
            existing = obs
            break
    
    if not existing:
        return jsonify({'error': 'Observer not found'}), 404
    
    # Check if entry with this seit already exists
    for obs in observers:
        if obs[0] == kk and obs[3] == seit:  # obs[0]=KK, obs[3]=seit
            return jsonify({'error': 'Entry with this date already exists'}), 400
    
    # Create new CSV row
    # Format: KK,VName,NName,seit,active,HbOrt,GH,HLG,HLM,HOW,HBG,HBM,HNS,NbOrt,GN,NLG,NLM,NOW,NBG,NBM,NNS
    new_row = [
        kk,                                      # 0: KK
        existing[1],                             # 1: VName
        existing[2],                             # 2: NName
        seit,                                    # 3: seit
        str(data['active']),                     # 4: active
        data['HbOrt'],                           # 5: HbOrt (H_Ort)
        data['GH'],                              # 6: GH (H_GG)
        str(data['HLG']),                        # 7: HLG (H_LaenGrad)
        str(data['HLM']),                        # 8: HLM (H_LaenMin)
        data['HOW'],                             # 9: HOW (H_EW)
        str(data['HBG']),                        # 10: HBG (H_BreiGrad)
        str(data['HBM']),                        # 11: HBM (H_BreiMin)
        data['HNS'],                             # 12: HNS (H_NS)
        data.get('NbOrt', ''),                   # 13: NbOrt (N_Ort)
        data.get('GN', ''),                      # 14: GN (N_GG)
        str(data.get('NLG', 0)),                 # 15: NLG (N_LaenGrad)
        str(data.get('NLM', 0)),                 # 16: NLM (N_LaenMin)
        data.get('NOW', ''),                     # 17: NOW (N_EW)
        str(data.get('NBG', 0)),                 # 18: NBG (N_BreiGrad)
        str(data.get('NBM', 0)),                 # 19: NBM (N_BreiMin)
        data.get('NNS', '')                      # 20: NNS (N_NS)
    ]
    
    # Add to list
    observers.append(new_row)
    
    # Sort observers by KK, then by seit (convert MM/YY to YYMM for proper sorting)
    def sort_key(obs):
        kk_val = obs[0]  # obs[0] is KK
        seit = obs[3]    # obs[3] is seit
        if seit and '/' in seit:
            parts = seit.split('/')
            if len(parts) == 2:
                month = int(parts[0])
                year = int(parts[1])
                # Convert to full year: years < 50 are 20xx, years >= 50 are 19xx
                full_year = 2000 + year if year < 50 else 1900 + year
                # Create sortable value: YYYYMM
                return (kk_val, full_year * 100 + month)
        return (kk_val, 0)
    
    observers.sort(key=sort_key)
    
    # Save using io module
    try:
        save_observers(observers)
        current_app.config['OBSERVERS'] = observers
        
        return jsonify({
            'success': True,
            'message': 'Site added successfully',
            'site': {
                'KK': new_row[0],
                'seit': new_row[3],
                'active': int(new_row[4])
            }
        })
    except Exception as e:
        return jsonify({'error': f'Failed to add site: {str(e)}'}), 500


@api_blueprint.route('/observers/<kk>/sites', methods=['PUT'])
def update_observer_site(kk):
    """Update an observation site entry for an observer"""
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Get originalSeit from request body
    seit = data.get('originalSeit')
    if not seit:
        return jsonify({'error': 'Original seit parameter required'}), 400
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Find the entry to update
    entry_found = False
    updated_observers = []
    
    for obs in observers:
        if obs[0] == kk and obs[3] == seit:  # obs[0]=KK, obs[3]=seit
            entry_found = True
            # Create new seit value from updated data
            new_seit = f"{str(data['seit_month']).zfill(2)}/{str(data['seit_year']).zfill(2)}"
            
            # Build updated row
            updated_row = [
                kk,  # 0: KK
                data.get('VName', obs[1] if len(obs) > 1 else ''),  # 1: VName
                data.get('NName', obs[2] if len(obs) > 2 else ''),  # 2: NName
                new_seit,  # 3: seit
                str(data.get('active', 1)),  # 4: active
                data.get('HbOrt', ''),  # 5: HbOrt
                data.get('GH', ''),  # 6: GH
                str(data.get('HLG', 0)),  # 7: HLG
                str(data.get('HLM', 0)),  # 8: HLM
                data.get('HOW', 'O'),  # 9: HOW
                str(data.get('HBG', 0)),  # 10: HBG
                str(data.get('HBM', 0)),  # 11: HBM
                data.get('HNS', 'N'),  # 12: HNS
                data.get('NbOrt', ''),  # 13: NbOrt
                data.get('GN', ''),  # 14: GN
                str(data.get('NLG', 0)),  # 15: NLG
                str(data.get('NLM', 0)),  # 16: NLM
                data.get('NOW', 'O'),  # 17: NOW
                str(data.get('NBG', 0)),  # 18: NBG
                str(data.get('NBM', 0)),  # 19: NBM
                data.get('NNS', 'N')  # 20: NNS
            ]
            updated_observers.append(updated_row)
        else:
            updated_observers.append(obs)
    
    if not entry_found:
        return jsonify({'error': 'Site entry not found'}), 404
    
    # Sort by KK and then by date
    def sort_key(obs):
        kk_val = obs[0]
        seit_parts = obs[3].split('/')
        month = int(seit_parts[0])
        year = int(seit_parts[1])
        full_year = 2000 + year if year < 50 else 1900 + year
        return (kk_val, full_year * 100 + month)
    
    updated_observers.sort(key=sort_key)
    
    # Save using io module
    try:
        save_observers(updated_observers)
        current_app.config['OBSERVERS'] = updated_observers
        
        return jsonify({
            'success': True
        })
    except Exception as e:
        return jsonify({'error': f'Failed to update site: {str(e)}'}), 500


@api_blueprint.route('/observers/<kk>/sites', methods=['DELETE'])
def delete_observer_site(kk):
    """Delete an observation site entry for an observer"""
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    # Get seit from request body
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    seit = data.get('seit')
    if not seit:
        return jsonify({'error': 'seit parameter required'}), 400
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Count how many entries exist for this observer
    observer_entries = [obs for obs in observers if obs[0] == kk]  # obs[0] is KK
    
    if len(observer_entries) <= 1:
        return jsonify({'error': 'Cannot delete the last site entry'}), 400
    
    # Find and remove the entry
    entry_found = False
    new_observers = []
    for obs in observers:
        if obs[0] == kk and obs[3] == seit:  # obs[0]=KK, obs[3]=seit
            entry_found = True
            continue
        new_observers.append(obs)
    
    if not entry_found:
        return jsonify({'error': 'Site entry not found'}), 404
    
    # Save using io module
    try:
        save_observers(new_observers)
        current_app.config['OBSERVERS'] = new_observers
        
        return jsonify({
            'success': True
        })
    except Exception as e:
        return jsonify({'error': f'Failed to delete site: {str(e)}'}), 500


@api_blueprint.route('/observers', methods=['DELETE'])
def delete_observer():
    """Delete all site entries for an observer"""
    
    # Get KK from request body
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    kk = data.get('KK')
    if not kk:
        return jsonify({'error': 'KK parameter required'}), 400
    
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    observers = current_app.config.get('OBSERVERS', [])
    
    # Find all entries for this observer
    observer_entries = [obs for obs in observers if obs[0] == kk]
    
    if not observer_entries:
        return jsonify({'error': 'Observer not found'}), 404
    
    # Remove all entries for this observer
    new_observers = [obs for obs in observers if obs[0] != kk]
    
    # Save using io module
    try:
        save_observers(new_observers)
        current_app.config['OBSERVERS'] = new_observers
        
        return jsonify({
            'success': True,
            'message': f'Observer {kk} deleted successfully',
            'deleted_count': len(observer_entries)
        })
    except Exception as e:
        return jsonify({'error': f'Failed to delete observer: {str(e)}'}), 500


@api_blueprint.route('/analysis', methods=['POST'])
def analyze_observations() -> Dict[str, Any]:
    """
    Perform analysis on observations with selected parameters.
    
    Request body:
        - param1: Primary parameter (MM, JJ, TT, ZZ, SH, KK, GG, O, f, C, d, EE, DD, H, F, V, zz, HO_HU, SE)
        - param1_from: Range start for param1 (varies by parameter type, e.g., day 1-31 for TT, degree -90 to +90 for SH)
        - param1_to: Range end for param1 (varies by parameter type, e.g., day 1-31 for TT, degree -90 to +90 for SH)
        - param1_month: Month for TT parameter (1-12, required when param1=TT)
        - param1_year: Year for TT parameter (0-99, required when param1=TT)
        - param2: Secondary parameter (optional)
        - param2_from: Range start for param2 (optional)
        - param2_to: Range end for param2 (optional)
        - param2_month: Month for param2 when TT (optional)
        - param2_year: Year for param2 when TT (optional)
        - filter1: First filter parameter (optional)
        - filter1_value: Value for filter1 (optional)
        - filter2: Second filter parameter (optional)
        - filter2_value: Value for filter2 (optional)
        - param1_ee_split: Split EE parameter (true/false)
        - param1_c_split: Split C parameter (true/false)
        - param1_dd_incomplete: Include incomplete DD observations (true/false)
        - filter1_ee_split: Split filter1 EE parameter (true/false)
        - filter1_c_split: Split filter1 C parameter (true/false)
        - filter1_dd_incomplete: Include incomplete filter1 DD (true/false)
        - filter2_ee_split: Split filter2 EE parameter (true/false)
        - filter2_c_split: Split filter2 C parameter (true/false)
        - filter2_dd_incomplete: Include incomplete filter2 DD (true/false)
    
    Returns:
        JSON object with:
        - success: True/False
        - data: Object with grouped observation counts {value: count, ...}
        - total: Total number of observations matching criteria
    """
    
    try:
        # Get request parameters
        params = request.get_json()
        
        # Load observations from current session or default file
        observations = current_app.config.get('OBSERVATIONS', [])
        if not observations:
            csv_handler = ObservationCSV()
            data_path = Path(__file__).parent.parent.parent.parent / 'data' / 'ALLE.CSV'
            observations, needs_conversion = csv_handler.read_observations(str(data_path))
            # Auto-convert legacy format
            if needs_conversion:
                csv_handler.write_observations(data_path, observations)
        
        # Apply filters first
        filtered_obs = observations
        
        # Apply filter1 if specified
        if params.get('filter1'):
            filter1 = params['filter1']
            filter1_value = params.get('filter1_value', '')
            filtered_obs = _apply_filter(filtered_obs, filter1, filter1_value, params, 'filter1')
        
        # Apply filter2 if specified
        if params.get('filter2'):
            filter2 = params['filter2']
            filter2_value = params.get('filter2_value', '')
            filtered_obs = _apply_filter(filtered_obs, filter2, filter2_value, params, 'filter2')
        
        # Apply param1 range filter if needed
        param1 = params.get('param1')
        filtered_obs = _apply_param_range_filter(filtered_obs, param1, params, 'param1')
        
        # Apply param2 range filter if specified
        param2 = params.get('param2')
        if param2:
            filtered_obs = _apply_param_range_filter(filtered_obs, param2, params, 'param2')
        
        # Group by parameter(s)
        if not param2:
            # Single parameter analysis
            data = _group_by_parameter(filtered_obs, param1, params, 'param1')
        else:
            # Two parameter analysis (cross-tabulation)
            data, debug_info = _group_by_two_parameters(filtered_obs, param1, param2, params)
        
        response_payload = {
            'success': True,
            'data': data,
            'total': len(filtered_obs)
        }
        # Include SH debug info when present
        if param2 and param1 and (param1 == 'SH' or param2 == 'SH'):
            response_payload['debug'] = debug_info

        return jsonify(response_payload)
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Analysis error: {str(e)}'
        }), 400


def _apply_filter(observations, param_name, param_value, all_params, prefix):
    """Apply a single filter constraint to observations."""
    result = []
    for obs in observations:
        if _matches_parameter(obs, param_name, param_value, all_params, prefix):
            result.append(obs)
    return result


def _get_timezone_offset(region_code):
    """Calculate timezone offset (in hours) for a geographic region.
    
    Args:
        region_code: Geographic region code (GG field, 1-39)
    
    Returns:
        Hour offset to add to CET to get local time
    """
    try:
        region = int(region_code)
    except (ValueError, TypeError):
        return 0
    
    # Asia regions (15-26)
    if 15 <= region <= 20:
        return 4
    elif 21 <= region <= 26:
        return 7
    
    # Americas regions (27-34)
    elif 27 <= region <= 30:
        return -6
    elif 31 <= region <= 34:
        return -4
    
    # Europe and other regions (1-14, 35-39)
    else:
        return 0


def _extract_sector_letters(sector_str: str) -> list[str]:
    """Return unique sector octant letters (a-h) found in the sector string."""
    if not sector_str:
        return []
    cleaned = []
    for ch in sector_str.lower():
        if 'a' <= ch <= 'h':
            cleaned.append(ch)
    return sorted(set(cleaned))


def _calculate_observation_solar_altitude(obs, observers_list, sh_type='mean'):
    """Calculate solar altitude for an observation.
    
    This is only applicable for sun observations (O=1) with known observer location.
    
    Args:
        obs: Observation object
        observers_list: List of observer records
        sh_type: Altitude calculation type ('min', 'mean', or 'max')
    
    Returns:
        Solar altitude in degrees (integer), or None if not calculable
    """
    # Only calculate for sun observations
    if obs.O != 1:
        return None
    
    # Skip if g=1 (observation outside known sites - location unknown)
    if obs.g == 1:
        return None
    
    # Find observer record valid for this observation date
    observer_kk = str(obs.KK).zfill(2)
    observer_record = None
    
    # Convert observation date to comparable format
    # obs.JJ is 2-digit year: >= 50 means 19xx, < 50 means 20xx
    obs_month = obs.MM
    obs_year_2digit = obs.JJ
    obs_year = 1900 + obs_year_2digit if obs_year_2digit >= 50 else 2000 + obs_year_2digit
    
    # Create sortable seit value for observation: YYYYMM (year*100 + month)
    obs_seit_comparable = obs_year * 100 + obs_month
    
    # Find the observer record for this KK that is valid on this observation date
    # Multiple records per observer - find the latest one with seit <= obs_seit
    candidates = []
    for obs_rec in observers_list:
        if obs_rec[0] == observer_kk:  # obs_rec[0] is KK field
            # obs_rec[3] is seit field in format "MM/YY"
            try:
                seit_parts = obs_rec[3].split('/')
                seit_month = int(seit_parts[0])
                seit_year_2digit = int(seit_parts[1])
                seit_year = 1900 + seit_year_2digit if seit_year_2digit >= 50 else 2000 + seit_year_2digit
                
                # Create sortable seit value for record: YYYYMM
                rec_seit_comparable = seit_year * 100 + seit_month
                
                # Check if this record is valid on the observation date
                if rec_seit_comparable <= obs_seit_comparable:
                    candidates.append((rec_seit_comparable, obs_rec))
            except (ValueError, IndexError):
                pass
    
    if candidates:
        # Use the record with the most recent seit date that is still valid
        candidates.sort(key=lambda x: x[0], reverse=True)
        observer_record = candidates[0][1]
    
    if not observer_record:
        return None
    
    # Convert observer record tuple to dict for easier access
    # Format: (KK, VName, NName, seit, aktiv, HbOrt, GH, HLG, HLM, HOW, HBG, HBM, HNS, NbOrt, GN, NLG, NLM, NOW, NBG, NBM, NNS)
    observer_dict = {
        'HLG': observer_record[7],   # Main site longitude degrees
        'HLM': observer_record[8],   # Main site longitude minutes
        'HOW': observer_record[9],   # Main site E/W ('O' for Ost/East, 'W' for West)
        'HBG': observer_record[10],  # Main site latitude degrees
        'HBM': observer_record[11],  # Main site latitude minutes
        'HNS': observer_record[12],  # Main site N/S
        'NLG': observer_record[15],  # Alternate site longitude degrees
        'NLM': observer_record[16],  # Alternate site longitude minutes
        'NOW': observer_record[17],  # Alternate site E/W ('O' for Ost/East, 'W' for West)
        'NBG': observer_record[18],  # Alternate site latitude degrees
        'NBM': observer_record[19],  # Alternate site latitude minutes
        'NNS': observer_record[20],  # Alternate site N/S
    }
    
    # Get observer coordinates
    longitude, latitude = get_observer_coordinates(observer_dict, obs.g)
    
    # Calculate solar altitude
    # Convert DD (duration in units of 10 minutes) to actual minutes
    # DD=1 means 10 minutes, DD=2 means 20 minutes, etc.
    duration_minutes = obs.DD * 10 if obs.DD >= 0 else 0
    
    altitude = calculate_solar_altitude(
        year=obs.JJ,
        month=obs.MM,
        day=obs.TT,
        hour=obs.ZS,
        minute=obs.ZM,
        duration=duration_minutes,
        longitude=longitude,
        latitude=latitude,
        altitude_type=sh_type,
        gg=obs.g
    )
    
    return altitude


def _apply_param_range_filter(observations, param_name, all_params, prefix):
    """Apply range filter to a parameter."""
    # Special handling for TT (day) - ALWAYS filter by month/year, regardless of range
    if param_name == 'TT':
        month_key = f'{prefix}_month'
        year_key = f'{prefix}_year'
        month = all_params.get(month_key)
        year = all_params.get(year_key)
        
        # TT parameter REQUIRES month and year context
        if month is None or year is None:
            return observations  # Can't filter without month/year
        
        try:
            month = int(month)
            year = int(year)
            # Convert 4-digit year to 2-digit if needed
            if year >= 1900:
                year = year % 100
        except (ValueError, TypeError):
            return observations
        
        # Filter by month and year first
        filtered = []
        for obs in observations:
            if obs.MM == month and obs.JJ == year:
                filtered.append(obs)
        
        # Then apply day range if specified
        from_key = f'{prefix}_from'
        to_key = f'{prefix}_to'
        if from_key in all_params and to_key in all_params:
            from_val = all_params.get(from_key)
            to_val = all_params.get(to_key)
            if from_val is not None and to_val is not None:
                try:
                    from_val = int(from_val)
                    to_val = int(to_val)
                    result = []
                    for obs in filtered:
                        if from_val <= obs.TT <= to_val:
                            result.append(obs)
                    return result
                except (ValueError, TypeError):
                    pass
        
        return filtered
    
    from_key = f'{prefix}_from'
    to_key = f'{prefix}_to'
    
    # Handle parameters with no range (single values)
    if from_key not in all_params or to_key not in all_params:
        return observations
    
    from_val = all_params.get(from_key)
    to_val = all_params.get(to_key)
    
    if from_val is None or to_val is None:
        return observations
    
    # Convert to appropriate numeric type
    try:
        if param_name == 'ZZ':
            # Time can be float
            from_val = float(from_val)
            to_val = float(to_val)
        elif param_name == 'JJ':
            # Year - convert 4-digit to 2-digit (1988 -> 88)
            from_val = int(from_val)
            to_val = int(to_val)
            if from_val >= 1900:
                from_val = from_val % 100
            if to_val >= 1900:
                to_val = to_val % 100
        else:
            # Most parameters are integers
            from_val = int(from_val)
            to_val = int(to_val)
    except (ValueError, TypeError):
        return observations
    
    # Special handling for different parameter types
    if param_name == 'TT':
        # Day parameter - requires month/year context
        return _apply_tt_range_filter(observations, all_params, prefix)
    elif param_name == 'JJ':
        # Year parameter - special handling for century boundary
        result = []
        
        # Handle year ranges that cross century boundary
        if from_val > to_val:
            # Range crosses century (e.g., 50-49 means 1950-1999 AND 2000-2049)
            for obs in observations:
                val = getattr(obs, param_name, None)
                if val is not None and (from_val <= val <= 99 or 0 <= val <= to_val):
                    result.append(obs)
        else:
            # Normal range within same century
            for obs in observations:
                val = getattr(obs, param_name, None)
                if val is not None and from_val <= val <= to_val:
                    result.append(obs)
        
        return result
    elif param_name == 'ZZ':
        # Time parameter - from/to are hours (0-23 or float)
        # Note: ZZ refers to ZS (hour) field in the observation model
        # Observations are stored in CET, but may need conversion to local time
        
        # Check if timezone conversion is needed
        timezone_key = f'{prefix}_timezone'
        use_local = all_params.get(timezone_key) == 'local'
        
        result = []
        for obs in observations:
            zz = obs.ZS if hasattr(obs, 'ZS') else 0
            
            # If local time requested, convert from CET to observer's local time
            if use_local:
                # Get observer's region to determine timezone offset
                # GG contains the geographic region code
                region_code = obs.GG if hasattr(obs, 'GG') else 0
                
                # Calculate timezone offset based on region
                # This is a simplified approach - in reality, timezones are complex
                # For now, we'll use rough approximations based on longitude
                # Europe regions (1-14): mostly CET (offset = 0)
                # Asia regions (15-26): UTC+5 to UTC+9 (offset = +4 to +8 from CET)
                # Americas regions (27-34): UTC-5 to UTC-8 (offset = -6 to -9 from CET)
                # Other regions: assume CET
                
                offset = 0
                if 15 <= region_code <= 20:  # West/Central Asia
                    offset = 4  # Roughly UTC+5 = CET+4
                elif 21 <= region_code <= 26:  # East Asia
                    offset = 7  # Roughly UTC+8 = CET+7
                elif 27 <= region_code <= 30:  # North America
                    offset = -6  # Roughly UTC-6 = CET-7
                elif 31 <= region_code <= 34:  # South America
                    offset = -4  # Roughly UTC-3 = CET-4
                
                # Apply offset (with wraparound for 24-hour clock)
                zz = (zz + offset) % 24
            
            if from_val <= zz <= to_val:
                result.append(obs)
        return result
    elif param_name == 'SH':
        # Solar altitude parameter - must be calculated on-the-fly
        # Only applicable for sun observations (O=1) at known observer locations (g != 1)
        observers = current_app.config.get('OBSERVERS', [])
        
        result = []
        for obs in observations:
            # Filter out observations that can't have solar altitude calculated
            if obs.O != 1 or obs.g == 1:
                continue
            
            sh_type = all_params.get('sh_type', 'mean')
            altitude = _calculate_observation_solar_altitude(obs, observers, sh_type)
            if altitude is not None and from_val <= altitude <= to_val:
                result.append(obs)
        
        return result
    elif param_name == 'HO_HU':
        # Pillar height parameter - check both HO and HU values
        result = []
        for obs in observations:
            ho = getattr(obs, 'HO', None)
            hu = getattr(obs, 'HU', None)
            # Include observation if either HO or HU is in range
            if (ho is not None and from_val <= ho <= to_val) or \
               (hu is not None and from_val <= hu <= to_val):
                result.append(obs)
        return result
    else:
        # Numeric range parameters
        result = []
        for obs in observations:
            val = getattr(obs, param_name, None)
            if val is not None and from_val <= val <= to_val:
                result.append(obs)
        return result


def _apply_tt_range_filter(observations, all_params, prefix):
    """Apply day range filter to TT parameter with month/year context."""
    month_key = f'{prefix}_month'
    year_key = f'{prefix}_year'
    from_key = f'{prefix}_from'
    to_key = f'{prefix}_to'
    
    month = all_params.get(month_key)
    year = all_params.get(year_key)
    day_from = all_params.get(from_key)
    day_to = all_params.get(to_key)
    
    # If any required parameter is missing, don't filter
    if month is None or year is None or day_from is None or day_to is None:
        return observations
    
    try:
        month = int(month)
        year = int(year)
        day_from = int(day_from)
        day_to = int(day_to)
        
        # Convert 4-digit year to 2-digit if needed
        if year >= 1900:
            year = year % 100
    except (ValueError, TypeError):
        return observations
    
    result = []
    for obs in observations:
        # Only include observations from the specified month and year, within day range
        if obs.MM == month and obs.JJ == year:
            if day_from <= obs.TT <= day_to:
                result.append(obs)
    
    return result


def _matches_parameter(obs, param_name, param_value, all_params, prefix):
    """Check if observation matches a parameter filter value."""
    # Special handling for TT (day) - requires month and year context
    if param_name == 'TT':
        # Day parameter requires month and year to be meaningful
        month_key = f'{prefix}_month'
        year_key = f'{prefix}_year'
        filter_month = all_params.get(month_key)
        filter_year = all_params.get(year_key)
        
        # If month/year not provided, can't match properly
        if filter_month is None or filter_year is None:
            return False
        
        try:
            filter_day = int(param_value)
            filter_month = int(filter_month)
            filter_year = int(filter_year)
            
            # Convert 4-digit year to 2-digit if needed
            if filter_year >= 1900:
                filter_year = filter_year % 100
            
            # Match all three: day, month, year
            return (obs.TT == filter_day and 
                    obs.MM == filter_month and 
                    obs.JJ == filter_year)
        except (ValueError, TypeError):
            return False
    
    # Get the parameter value from observation
    # Special handling for ZZ (time) - use ZS (hour) field
    if param_name == 'ZZ':
        obs_value = getattr(obs, 'ZS', None)
        # Apply timezone conversion if needed
        if obs_value is not None:
            timezone_key = f'{prefix}_timezone'
            use_local = all_params.get(timezone_key) == 'local'
            if use_local:
                region_code = getattr(obs, 'GG', None)
                offset = _get_timezone_offset(region_code)
                obs_value = (obs_value + offset) % 24
    elif param_name == 'SH':
        # Solar altitude - must be calculated (only for sun observations at known locations)
        if obs.O != 1 or obs.g == 1:
            obs_value = None
        else:
            observers = current_app.config.get('OBSERVERS', [])
            sh_type = all_params.get('sh_type', 'mean')
            obs_value = _calculate_observation_solar_altitude(obs, observers, sh_type)
    elif param_name == 'SE':
        # Sectors: check if the filter octant letter is present in the sectors string
        sector_letters = _extract_sector_letters(getattr(obs, 'sectors', ''))
        # param_value should be a single letter a-h
        return param_value.lower() in sector_letters
    else:
        obs_value = getattr(obs, param_name, None)
    

    
    if obs_value is None:
        return False
    
    # Convert param_value to appropriate type for comparison
    try:
        if param_name in ['MM', 'JJ', 'ZZ', 'SH', 'KK', 'GG', 'O', 'f', 'd', 'EE', 'DD', 'H', 'F', 'V', 'zz']:
            # Most parameters are integers (note: TT handled above)
            if param_name == 'ZZ':
                # Time can be float
                param_value = float(param_value)
            elif param_name == 'JJ':
                # Year - convert 4-digit to 2-digit (1988 -> 88)
                param_value = int(param_value)
                if param_value >= 1900:
                    param_value = param_value % 100
            else:
                param_value = int(param_value)
            return obs_value == param_value
    except (ValueError, TypeError):
        return False
    
    # For composite parameters, handle special cases
    if param_name == 'C':
        # Completeness can have split option
        split_key = f'{prefix}_c_split'
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        if all_params.get(split_key):
            # When split, compare the full C value
            return obs.C == param_value
        else:
            # When not split, compare without suffix
            return str(obs.C).rstrip('+') == str(param_value)
    
    elif param_name == 'EE':
        # Halo type can have split option
        split_key = f'{prefix}_ee_split'
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        if all_params.get(split_key):
            return obs.EE == param_value
        else:
            return str(obs.EE).rstrip('*') == str(param_value)
    
    elif param_name == 'HO_HU':
        # Match if either HO or HU equals the requested height (only valid when >=0)
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        ho = getattr(obs, 'HO', None)
        hu = getattr(obs, 'HU', None)
        ho_match = ho is not None and ho >= 0 and ho == param_value
        hu_match = hu is not None and hu >= 0 and hu == param_value
        return ho_match or hu_match

    elif param_name == 'DD':
        # Duration with incomplete option
        incomplete_key = f'{prefix}_dd_incomplete'
        try:
            param_value = int(param_value)
        except (ValueError, TypeError):
            return False
        if all_params.get(incomplete_key):
            # Include all observations
            return True
        else:
            # Exclude observations with kA or kE
            return obs.DD is not None and obs.DD not in ['kA', 'kE', '', None]
    
    return obs_value == param_value


def _group_by_parameter(observations, param_name, all_params, prefix):
    """Group observations by a single parameter and return counts."""
    
    groups = defaultdict(int)
    
    # Check if timezone conversion is needed for ZZ parameter
    timezone_key = f'{prefix}_timezone'
    use_local = all_params.get(timezone_key) == 'local' and param_name == 'ZZ'
    
    # Check if we need observer data for SH calculation
    observers = None
    if param_name == 'SH':
        observers = current_app.config.get('OBSERVERS', [])
    
    for obs in observations:
        # Get parameter value from observation
        # Special handling for TT (day) - observations are already filtered by month/year in _apply_param_range_filter
        if param_name == 'TT':
            # Just use the day value directly - filtering by month/year already done
            value = obs.TT
        # Special handling for ZZ (time) - use ZS (hour) field
        elif param_name == 'ZZ':
            value = getattr(obs, 'ZS', None)
            
            # Apply timezone conversion if needed
            if value is not None and use_local:
                region_code = obs.GG if hasattr(obs, 'GG') else 0
                offset = _get_timezone_offset(region_code)
                value = (value + offset) % 24
        elif param_name == 'SH':
            # Solar altitude - must be calculated (only for sun observations at known locations)
            if obs.O != 1 or obs.g == 1:
                value = None
            else:
                sh_type = all_params.get('sh_type', 'mean')
                value = _calculate_observation_solar_altitude(obs, observers, sh_type)
        elif param_name == 'HO_HU':
            # Light pillar heights: count both HO and HU if present (>=0)
            ho = getattr(obs, 'HO', None)
            hu = getattr(obs, 'HU', None)
            added = False
            if ho is not None and ho >= 0:
                groups[str(ho)] += 1
                added = True
            if hu is not None and hu >= 0:
                groups[str(hu)] += 1
                added = True
            value = None if added else None
        elif param_name == 'C':
            # Cirrus type with split option
            value = getattr(obs, 'C', None)
            split_key = f'{prefix}_c_split'
            if value is not None and all_params.get(split_key):
                # When split is enabled, expand C4/C5/C6/C7 into components
                c_value = int(value) if isinstance(value, (int, str)) else value
                if c_value == 4:  # C4 (Ci + Cc) → count as both C1 and C2
                    groups['1'] += 1
                    groups['2'] += 1
                    value = None  # Don't count again below
                elif c_value == 5:  # C5 (Ci + Cs) → count as both C1 and C3
                    groups['1'] += 1
                    groups['3'] += 1
                    value = None  # Don't count again below
                elif c_value == 6:  # C6 (Cc + Cs) → count as both C2 and C3
                    groups['2'] += 1
                    groups['3'] += 1
                    value = None  # Don't count again below
                elif c_value == 7:  # C7 (Ci + Cc + Cs) → count as C1, C2, and C3
                    groups['1'] += 1
                    groups['2'] += 1
                    groups['3'] += 1
                    value = None  # Don't count again below
        elif param_name == 'EE':
            # Halo type with split option
            value = getattr(obs, 'EE', None)
            split_key = f'{prefix}_ee_split'
            if value is not None and all_params.get(split_key):
                # When split is enabled, expand combined halo types into components
                ee_value = int(value) if isinstance(value, (int, str)) else value
                if ee_value in COMBINED_TO_INDIVIDUAL_HALOS:
                    left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee_value]
                    groups[str(left)] += 1
                    groups[str(right)] += 1
                    value = None  # Don't count again below
        elif param_name == 'SE':
            # Sectors: count octants present or visible
            # V=2 (complete halo): all segments a-h are visible
            # V=1 (incomplete halo): only explicitly listed segments are visible
            # No segments: "nicht zutreffend" - skip this observation entirely
            v = getattr(obs, 'V', None)
            if v == 2:
                # Complete halo: count all segments a-h
                sector_letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
            else:
                # Incomplete halo: extract explicit sectors
                sector_letters = _extract_sector_letters(getattr(obs, 'sectors', ''))
            
            # Only count observations that have sectors (skip "nicht zutreffend")
            for letter in sector_letters:
                groups[letter] += 1
            continue  # Skip further processing for this observation
        else:
            value = getattr(obs, param_name, None)
        
        # Convert 2-digit years to 4-digit years for JJ parameter
        if param_name == 'JJ' and value is not None:
            year = int(value) if isinstance(value, (int, str)) else value
            # Year < 50 = 20xx, Year >= 50 = 19xx (as per HALO key standard)
            if year < 50:
                value = 2000 + year
            elif year < 100:
                value = 1900 + year
            # else: already 4-digit year
        
        # Use unformatted key for grouping to avoid duplicates
        if value is None:
            if param_name in ['C', 'EE', 'HO_HU']:
                # For split/combined parameters, component values may already be counted
                pass
            else:
                group_key = 'keine Angabe'  # "not observed"
                groups[group_key] += 1
        else:
            group_key = str(value)  # Keep numeric/raw value for grouping
            groups[group_key] += 1
    
    # Generate all values in the range if range is specified
    result = dict(groups)
    
    # Skip range expansion for non-numeric sectors parameter
    if param_name != 'SE':
        # Get range from parameters
        from_key = f'{prefix}_from'
        to_key = f'{prefix}_to'
        
        if from_key in all_params and to_key in all_params:
            from_val = all_params[from_key]
            to_val = all_params[to_key]
            
            if from_val is not None and to_val is not None:
                try:
                    from_val = int(from_val) if from_val else None
                    to_val = int(to_val) if to_val else None
                    
                    if from_val is not None and to_val is not None:
                        # Generate all values in range (handling century boundary for JJ)
                        range_values = []
                        
                        if param_name == 'TT':
                            # Day parameter - generate ALL days in the month (1 to max_day)
                            # Get the number of days in the specified month
                            month_key = f'{prefix}_month'
                            year_key = f'{prefix}_year'
                            month = all_params.get(month_key)
                            year = all_params.get(year_key)
                            
                            if month is not None and year is not None:
                                try:
                                    month = int(month)
                                    year = int(year)
                                    # Convert 2-digit year to 4-digit for calendar
                                    if year < 50:
                                        year = 2000 + year
                                    elif year < 100:
                                        year = 1900 + year
                                    
                                    # Get max days in this month
                                    max_day = calendar.monthrange(year, month)[1]
                                    
                                    # Generate all days in month (1 to max_day)
                                    range_values = list(range(1, max_day + 1))
                                except (ValueError, TypeError):
                                    # Fallback to 1-31
                                    range_values = list(range(1, 32))
                            else:
                                # No month/year context, generate 1-31
                                range_values = list(range(1, 32))
                        elif param_name == 'JJ':
                            # Year - convert 2-digit to 4-digit, then handle range
                            # Year < 50 = 20xx, Year >= 50 = 19xx
                            from_year = from_val
                            to_year = to_val
                            
                            if from_year < 50:
                                from_year = 2000 + from_year
                            elif from_year < 100:
                                from_year = 1900 + from_year
                                
                            if to_year < 50:
                                to_year = 2000 + to_year
                            elif to_year < 100:
                                to_year = 1900 + to_year
                            
                            # Now generate range with 4-digit years
                            if from_year > to_year:
                                # Century boundary case: 1990-2010 for example
                                range_values = list(range(from_year, 2050)) + list(range(1950, to_year + 1))
                            else:
                                # Normal case
                                range_values = list(range(from_year, to_year + 1))
                        else:
                            # Regular numeric range
                            range_values = list(range(from_val, to_val + 1))
                        
                        # Add missing values with count 0
                        for val in range_values:
                            str_val = str(val)
                            if str_val not in result:
                                result[str_val] = 0
                except (ValueError, TypeError):
                    pass
    
    # Sort keys intelligently (before formatting)
    def numeric_sort_key(item):
        key = item[0]
        if key == 'keine Angabe':
            return (0, float('-inf'))  # Sort to beginning
        try:
            return (1, float(key))  # Sort numerically
        except (ValueError, TypeError):
            return (2, key)  # Non-numeric at end
    
    # Apply numeric sorting for all parameters (numeric parameters sort numerically, others alphabetically)
    result = dict(sorted(result.items(), key=numeric_sort_key))
    
    # Remove combined types when split is enabled (they will have 0 counts)
    if param_name == 'C' and all_params.get(f'{prefix}_c_split'):
        # Remove C4, C5, C6, C7 (combined cirrus types)
        for combined_c in ['4', '5', '6', '7']:
            result.pop(combined_c, None)
    elif param_name == 'EE' and all_params.get(f'{prefix}_ee_split'):
        # Remove combined halo types
        for combined_ee in COMBINED_TO_INDIVIDUAL_HALOS.keys():
            result.pop(str(combined_ee), None)
    
    # Format values for display - return as ordered list to preserve sort order in JSON
    formatted_result = [
        {"key": key, "count": count}
        for key, count in result.items()
    ]
    
    return formatted_result


def _group_by_two_parameters(observations, param1_name, param2_name, all_params):
    """Group observations by two parameters and return cross-tabulation."""
    
    # Create nested structure for cross-tab
    groups = defaultdict(lambda: defaultdict(int))
    
    # Check if we need observer data for SH calculation
    observers = None
    if param1_name == 'SH' or param2_name == 'SH':
        observers = current_app.config.get('OBSERVERS', [])

    # Debug counters for SH and HO_HU calculations
    hohu_debug = {
        'processed': 0,
        'samples': []
    }
    sh_debug = {
        'param1_attempts': 0,
        'param1_none': 0,
        'param2_attempts': 0,
        'param2_none': 0,
    }
    
    for obs in observations:
        # Get values for both parameters
        # Special handling for ZZ (time) - use ZS (hour) field
        if param1_name == 'ZZ':
            val1 = getattr(obs, 'ZS', None)
            # ZS=-1 means time not specified - skip this observation for time analysis
            if val1 == -1:
                continue
        elif param1_name == 'SH':
            if obs.O != 1 or obs.g == 1:
                val1 = None
                sh_debug['param1_none'] += 1
            else:
                sh_type = all_params.get('sh_type', 'mean')
                val1 = _calculate_observation_solar_altitude(obs, observers, sh_type)
                sh_debug['param1_attempts'] += 1
                if val1 is None:
                    sh_debug['param1_none'] += 1
        else:
            val1 = getattr(obs, param1_name, None)
        
        if param2_name == 'ZZ':
            val2 = getattr(obs, 'ZS', None)
            # ZS=-1 means time not specified - skip this observation for time analysis
            if val2 == -1:
                continue
        elif param2_name == 'SH':
            if obs.O != 1 or obs.g == 1:
                val2 = None
                sh_debug['param2_none'] += 1
            else:
                sh_type = all_params.get('sh_type', 'mean')
                val2 = _calculate_observation_solar_altitude(obs, observers, sh_type)
                sh_debug['param2_attempts'] += 1
                if val2 is None:
                    sh_debug['param2_none'] += 1
        else:
            val2 = getattr(obs, param2_name, None)
        
        # Apply timezone conversion for time parameters if needed
        if param1_name == 'ZZ' and val1 is not None:
            use_local = all_params.get('param1_timezone') == 'local'
            if use_local:
                region_code = getattr(obs, 'GG', None)
                offset = _get_timezone_offset(region_code)
                val1 = (val1 + offset) % 24
        
        if param2_name == 'ZZ' and val2 is not None:
            use_local = all_params.get('param2_timezone') == 'local'
            if use_local:
                region_code = getattr(obs, 'GG', None)
                offset = _get_timezone_offset(region_code)
                val2 = (val2 + offset) % 24
        
        # Handle C (cirrus) splitting for param1
        if param1_name == 'SE':
            # Sectors: count octants present or visible
            # V=2 (complete halo): all segments a-h are visible
            # V=1 (incomplete halo): only explicitly listed segments are visible
            v = getattr(obs, 'V', None)
            if v == 2:
                # Complete halo: count all segments a-h
                val1_list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
            else:
                # Incomplete halo: extract explicit sectors
                sector_letters = _extract_sector_letters(getattr(obs, 'sectors', ''))
                val1_list = sector_letters if sector_letters else []
        elif param1_name == 'HO_HU':
            ho = getattr(obs, 'HO', None)
            hu = getattr(obs, 'HU', None)
            val1_list = []
            if ho is not None and ho >= 0:
                val1_list.append(str(ho))
            if hu is not None and hu >= 0:
                val1_list.append(str(hu))
            if not val1_list:
                val1_list = ['keine Angabe']
            if len(hohu_debug['samples']) < 5:
                hohu_debug['samples'].append({'obs': obs.__dict__.get('KK', None), 'ho': ho, 'hu': hu, 'val1_list': list(val1_list)})
            hohu_debug['processed'] += 1
        elif param1_name == 'C' and val1 is not None and all_params.get('param1_c_split'):
            c_value = int(val1) if isinstance(val1, (int, str)) else val1
            if c_value == 4:  # C4 (Ci + Cc) → count as both C1 and C2
                val1_list = ['1', '2']
            elif c_value == 5:  # C5 (Ci + Cs) → count as both C1 and C3
                val1_list = ['1', '3']
            elif c_value == 6:  # C6 (Cc + Cs) → count as both C2 and C3
                val1_list = ['2', '3']
            elif c_value == 7:  # C7 (Ci + Cc + Cs) → count as C1, C2, and C3
                val1_list = ['1', '2', '3']
            else:
                val1_list = [str(c_value)]
        # Handle EE (halo) splitting for param1
        elif param1_name == 'EE' and val1 is not None and all_params.get('param1_ee_split'):
            ee_value = int(val1) if isinstance(val1, (int, str)) else val1
            if ee_value in COMBINED_TO_INDIVIDUAL_HALOS:
                left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee_value]
                val1_list = [str(left), str(right)]
            else:
                val1_list = [str(ee_value)]
        else:
            val1_list = [str(val1) if val1 is not None else 'keine Angabe']
        
        # Handle C (cirrus) splitting for param2
        if param2_name == 'SE':
            # Sectors: count octants present or visible
            # V=2 (complete halo): all segments a-h are visible
            # V=1 (incomplete halo): only explicitly listed segments are visible
            v = getattr(obs, 'V', None)
            if v == 2:
                # Complete halo: count all segments a-h
                val2_list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
            else:
                # Incomplete halo: extract explicit sectors
                sector_letters = _extract_sector_letters(getattr(obs, 'sectors', ''))
                val2_list = sector_letters if sector_letters else []
        elif param2_name == 'HO_HU':
            ho = getattr(obs, 'HO', None)
            hu = getattr(obs, 'HU', None)
            val2_list = []
            if ho is not None and ho >= 0:
                val2_list.append(str(ho))
            if hu is not None and hu >= 0:
                val2_list.append(str(hu))
            if not val2_list:
                val2_list = ['keine Angabe']
            if param1_name != 'HO_HU' and len(hohu_debug['samples']) < 5:
                hohu_debug['samples'].append({'obs': obs.__dict__.get('KK', None), 'ho': ho, 'hu': hu, 'val2_list': list(val2_list)})
            hohu_debug['processed'] += 1
        elif param2_name == 'C' and val2 is not None and all_params.get('param2_c_split'):
            c_value = int(val2) if isinstance(val2, (int, str)) else val2
            if c_value == 4:  # C4 (Ci + Cc) → count as both C1 and C2
                val2_list = ['1', '2']
            elif c_value == 5:  # C5 (Ci + Cs) → count as both C1 and C3
                val2_list = ['1', '3']
            elif c_value == 6:  # C6 (Cc + Cs) → count as both C2 and C3
                val2_list = ['2', '3']
            elif c_value == 7:  # C7 (Ci + Cc + Cs) → count as C1, C2, and C3
                val2_list = ['1', '2', '3']
            else:
                val2_list = [str(c_value)]
        # Handle EE (halo) splitting for param2
        elif param2_name == 'EE' and val2 is not None and all_params.get('param2_ee_split'):
            ee_value = int(val2) if isinstance(val2, (int, str)) else val2
            if ee_value in COMBINED_TO_INDIVIDUAL_HALOS:
                left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee_value]
                val2_list = [str(left), str(right)]
            else:
                val2_list = [str(ee_value)]
        else:
            val2_list = [str(val2) if val2 is not None else 'keine Angabe']
        
        # Count all combinations
        for v1 in val1_list:
            for v2 in val2_list:
                groups[v1][v2] += 1

    # Debug: summarize HO_HU counts before range expansion
    if (param1_name == 'HO_HU' or param2_name == 'HO_HU'):
        hohu_total = 0
        hohu_rows = []
        for k1, inner in groups.items():
            for k2, cnt in inner.items():
                hohu_total += cnt
                if len(hohu_rows) < 5 and cnt > 0:
                    hohu_rows.append((k1, k2, cnt))
    
    # Generate all values for param1 range FIRST
    # Only fill ranges for parameters where all values in range are meaningful
    param1_from_key = 'param1_from'
    param1_to_key = 'param1_to'
    param1_range_values = []
    
    # Parameters that support complete range filling (every value exists/is meaningful)
    rangeable_params = ['ZZ', 'MM', 'TT', 'JJ', 'DD', 'C', 'dd', 'SH', 'EE', 'GG', 'KK', 'HO_HU']
    
    if param1_name in rangeable_params and param1_from_key in all_params and param1_to_key in all_params:
        from_val = all_params[param1_from_key]
        to_val = all_params[param1_to_key]
        
        i18n = get_i18n()
        if from_val is not None and to_val is not None:
            try:
                from_val = int(from_val) if from_val else None
                to_val = int(to_val) if to_val else None
                
                if from_val is not None and to_val is not None:
                    if param1_name == 'JJ':
                        # Year - handle century boundary
                        if from_val > to_val:
                            param1_range_values = list(range(from_val, 100)) + list(range(0, to_val + 1))
                        else:
                            param1_range_values = list(range(from_val, to_val + 1))
                    elif param1_name == 'EE':
                        # Halo types - only those defined in i18n
                        valid_ee = set(int(k) for k in i18n.strings['halo_types'].keys())
                        param1_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_ee:
                                param1_range_values.append(val)
                    elif param1_name == 'GG':
                        # Geographic regions - only those defined in i18n
                        valid_gg = set(int(k) for k in i18n.strings['geographic_regions'].keys())
                        param1_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_gg:
                                param1_range_values.append(val)
                    elif param1_name == 'KK':
                        # Observers - show all that exist in observer database, regardless of observations
                        observers = current_app.config.get('OBSERVERS', [])
                        # Observers are lists, KK is at index 0
                        existing_kk = sorted(set(int(obs[0]) for obs in observers))
                        param1_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in existing_kk:
                                param1_range_values.append(val)
                    else:
                        param1_range_values = list(range(from_val, to_val + 1))
            except (ValueError, TypeError):
                pass
    
    # Generate all values for param2 range
    param2_from_key = 'param2_from'
    param2_to_key = 'param2_to'
    param2_range_values = []
    
    if param2_name in rangeable_params and param2_from_key in all_params and param2_to_key in all_params:
        from_val = all_params[param2_from_key]
        to_val = all_params[param2_to_key]
        
        if from_val is not None and to_val is not None:
            try:
                from_val = int(from_val) if from_val else None
                to_val = int(to_val) if to_val else None
                
                if from_val is not None and to_val is not None:
                    if param2_name == 'JJ':
                        # Year - handle century boundary
                        if from_val > to_val:
                            param2_range_values = list(range(from_val, 100)) + list(range(0, to_val + 1))
                        else:
                            param2_range_values = list(range(from_val, to_val + 1))
                    elif param2_name == 'EE':
                        # Halo types - only those defined in i18n
                        valid_ee = set(int(k) for k in i18n.strings['halo_types'].keys())
                        param2_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_ee:
                                param2_range_values.append(val)
                    elif param2_name == 'GG':
                        # Geographic regions - only those defined in i18n
                        valid_gg = set(int(k) for k in i18n.strings['geographic_regions'].keys())
                        param2_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in valid_gg:
                                param2_range_values.append(val)
                    elif param2_name == 'KK':
                        # Observers - show all that exist in observer database, regardless of observations
                        observers = current_app.config.get('OBSERVERS', [])
                        # Observers are lists, KK is at index 0
                        existing_kk = sorted(set(int(obs[0]) for obs in observers))
                        param2_range_values = []
                        for val in range(from_val, to_val + 1):
                            if val in existing_kk:
                                param2_range_values.append(val)
                    else:
                        param2_range_values = list(range(from_val, to_val + 1))
            except (ValueError, TypeError):
                pass
    
    # Build complete result table with pre-initialization strategy
    # Step 1: Determine which param1 and param2 values to include
    
    # Convert param1_range_values to string keys for display
    param1_values_to_show = []
    if param1_range_values:
        param1_values_to_show = [str(v % 100) if param1_name == 'JJ' else str(v) for v in param1_range_values]
    else:
        # Use all param1 values that appear in observations
        param1_values_to_show = sorted(groups.keys())
    
    # Collect all param2 values from observations
    param2_from_observations = set()
    for p1_val in groups:
        param2_from_observations.update(groups[p1_val].keys())
    
    # Determine param2 values to show
    param2_values_to_show = []
    if param2_range_values:
        param2_values_to_show = [str(v % 100) if param2_name == 'JJ' else str(v) for v in param2_range_values]
    else:
        # Use all param2 values that appear in observations
        param2_values_to_show = sorted(param2_from_observations)
    
    # Step 2: Initialize result table with all param1 × param2 combinations = 0
    result = {}
    for p1_val in param1_values_to_show:
        result[p1_val] = {}
        for p2_val in param2_values_to_show:
            result[p1_val][p2_val] = 0
    
    # Step 3: Fill in counts from groups
    for p1_val in groups:
        if p1_val not in result:
            # This shouldn't happen if we set up param1_values_to_show correctly
            result[p1_val] = {}
        for p2_val in groups[p1_val]:
            if p2_val not in result[p1_val]:
                # This shouldn't happen if we set up param2_values_to_show correctly
                result[p1_val][p2_val] = 0
            result[p1_val][p2_val] = groups[p1_val][p2_val]
    
    # Remove combined types when split is enabled (they will have 0 counts)
    # For param1
    if param1_name == 'C' and all_params.get('param1_c_split'):
        for combined_c in ['4', '5', '6', '7']:
            result.pop(combined_c, None)
    elif param1_name == 'EE' and all_params.get('param1_ee_split'):
        for combined_ee in COMBINED_TO_INDIVIDUAL_HALOS.keys():
            result.pop(str(combined_ee), None)
    
    # For param2
    if param2_name == 'C' and all_params.get('param2_c_split'):
        combined_c_list = ['4', '5', '6', '7']
        for param1_val in result:
            for combined_c in combined_c_list:
                result[param1_val].pop(combined_c, None)
    elif param2_name == 'EE' and all_params.get('param2_ee_split'):
        combined_ee_list = [str(k) for k in COMBINED_TO_INDIVIDUAL_HALOS.keys()]
        for param1_val in result:
            for combined_ee in combined_ee_list:
                result[param1_val].pop(combined_ee, None)

    # Emit debug info for SH calculations to diagnose empty tables
    if (param1_name == 'SH' or param2_name == 'SH'):
        if current_app and current_app.logger:
            current_app.logger.debug(
                "SH debug: param1_attempts=%s param1_none=%s param2_attempts=%s param2_none=%s",
                sh_debug['param1_attempts'],
                sh_debug['param1_none'],
                sh_debug['param2_attempts'],
                sh_debug['param2_none']
            )
        # Also print to stdout in case logger level filters debug
        try:
            print(
                f"SH debug: param1_attempts={sh_debug['param1_attempts']} param1_none={sh_debug['param1_none']} "
                f"param2_attempts={sh_debug['param2_attempts']} param2_none={sh_debug['param2_none']}"
            )
        except Exception:
            pass

    return result, sh_debug


def _format_parameter_value(value, param_name, all_params, prefix):
    """Format a parameter value for display."""
    
    
    if value is None:
        return 'keine Angabe'
    
    # For KK (observer), format as "KK - Firstname Lastname"
    if param_name == 'KK':
        try:
            kk = int(value) if isinstance(value, (int, float, str)) else None
            if kk is not None:
                # Get observers from app config
                observers = current_app.config.get('OBSERVERS', [])
                # Find observer with matching KK (observers are tuples with KK at index 0)
                observer = next((obs for obs in observers if obs[0] == str(kk).zfill(2)), None)
                if observer:
                    # observer tuple: (KK, VName, NName, seit, aktiv, HbOrt, ...)
                    vname = observer[1] if len(observer) > 1 else ''
                    nname = observer[2] if len(observer) > 2 else ''
                    return f"{str(kk).zfill(2)} - {vname} {nname}".strip()
                # Fallback if observer not found
                return str(kk).zfill(2)
        except (ValueError, IndexError):
            pass
    
    # For year (JJ), convert 2-digit to 4-digit for display
    if param_name == 'JJ':
        year = int(value)
        if year < 50:
            return str(2000 + year)
        else:
            return str(1900 + year)
    
    # For SH (solar altitude), just return numeric string (no degree symbol)
    if param_name == 'SH':
        try:
            altitude = int(value)
            return str(altitude)
        except (ValueError, TypeError):
            return str(value)

    # For HO_HU (light pillar heights), return numeric string
    if param_name == 'HO_HU':
        try:
            return str(int(value))
        except (ValueError, TypeError):
            return str(value)
    
    # For EE with split option, remove asterisk
    if param_name == 'EE':
        split_key = f'{prefix}_ee_split'
        if not all_params.get(split_key) and isinstance(value, str):
            return value.rstrip('*')
    
    # For C with split option, remove plus sign
    if param_name == 'C':
        split_key = f'{prefix}_c_split'
        if not all_params.get(split_key) and isinstance(value, str):
            return value.rstrip('+')
    
    return value

