"""Configuration and constants API endpoints.

Routes: /constants, /config, /config/inputmode, /config/outputmode,
        /config/datedefault, /config/fixed_observer, /config/upload_observer_kk,
        /config/active_observers, /config/startup_file

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

from pathlib import Path
from typing import Dict, Any

from flask import jsonify, request, current_app, session

from halo.api import api_blueprint
from halo.config import is_cloud_mode, get_cloud_server_url
from halo.models.constants import (
    CIRCULAR_HALOS,
    COMBINED_TO_INDIVIDUAL_HALOS,
    DEFAULT_OBSERVATION_LIMIT,
)
from halo.services.settings import Settings


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
        ALL_PILLAR_HEIGHT_VALUES,
        PASSWORD_MIN_LENGTH,
        PASSWORD_REQUIRE_CATEGORIES,
        VALID_HALO_TYPES
    )
    
    return jsonify({
        'geographic_regions': GEOGRAPHIC_REGIONS,
        'circular_halos': list(CIRCULAR_HALOS),
        'combined_to_individual_halos': COMBINED_TO_INDIVIDUAL_HALOS,
        'halo_type_factors': HALO_TYPE_FACTORS,
        'halo_brightness_factors': HALO_BRIGHTNESS_FACTORS,
        'default_observation_limit': DEFAULT_OBSERVATION_LIMIT,
        'pillar_height_values': PILLAR_HEIGHT_VALUES,
        'all_pillar_height_values': ALL_PILLAR_HEIGHT_VALUES,
        'valid_halo_types': VALID_HALO_TYPES,
        'password_policy': {
            'min_length': PASSWORD_MIN_LENGTH,
            'require_categories': PASSWORD_REQUIRE_CATEGORIES
        }
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


@api_blueprint.route('/config/inputmode', methods=['GET', 'PUT'])
def inputmode() -> Dict[str, Any]:
    """Get or set Eingabeart (input mode) - implements 'Einstellungen -> Eingabeart' from H_BEOBNG.PAS"""
    if request.method == 'PUT':
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


@api_blueprint.route('/config/outputmode', methods=['GET', 'PUT'])
def outputmode() -> Dict[str, Any]:
    """Get or set Ausgabeart (output format) - NEW FEATURE not in original software"""
    if request.method == 'PUT':
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


@api_blueprint.route('/config/datedefault', methods=['GET', 'PUT'])
def datedefault() -> Dict[str, Any]:
    """Get or set date default (Datumsvoreinstellung) - NEW FEATURE"""
    
    if request.method == 'PUT':
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


@api_blueprint.route('/config/fixed_observer', methods=['GET', 'PUT'])
def fixed_observer() -> Dict[str, Any]:
    """Get or set fixed observer (fester Beobachter)"""
    if request.method == 'PUT':
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
        # Cloud Mode: Read from session (set on login)
        # Local Mode: Read from app.config (optional UI setting)
        if is_cloud_mode():
            observer = session.get('observer_kk', '')
        else:
            observer = current_app.config.get('FIXED_OBSERVER', '')
        
        return jsonify({
            'observer': observer,
            'cloud_mode': is_cloud_mode(),
            'editable': not is_cloud_mode()
        })


@api_blueprint.route('/config/upload_observer_kk', methods=['GET', 'PUT'])
def upload_observer_kk() -> Dict[str, Any]:
    """Get or set the saved observer_kk for upload/download convenience."""
    
    if request.method == 'PUT':
        data = request.get_json()
        observer_kk = data.get('observer_kk', '')
        
        current_app.config['UPLOAD_OBSERVER_KK'] = str(observer_kk)
        
        # Persist setting
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'UPLOAD_OBSERVER_KK', str(observer_kk))
        
        return jsonify({
            'success': True
        })
    else:
        observer_kk = current_app.config.get('UPLOAD_OBSERVER_KK', '')
        
        return jsonify({
            'observer_kk': observer_kk
        })


@api_blueprint.route('/config/active_observers', methods=['GET', 'PUT'])
def active_observers_setting() -> Dict[str, Any]:
    """Get or set the 'aktive Beobachter' setting.

    This setting controls whether only active observers should be considered.
    As requested, this setting does not change current observers or observations menus behavior.
    """

    if request.method == 'PUT':
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


@api_blueprint.route('/config/startup_file', methods=['GET', 'PUT'])
def startup_file_setting() -> Dict[str, Any]:
    """Get or set the startup file setting.
    
    This setting controls whether a file should be automatically loaded on program start.
    """
    
    # Cloud Mode: Startup file not supported (no file operations)
    if is_cloud_mode():
        return jsonify({
            'success': False,
            'error': 'startup_file_cloud_mode_not_supported'
        }), 403
    
    if request.method == 'PUT':
        data = request.get_json() or {}
        file_path = data.get('file_path', '')
        
        current_app.config['STARTUP_FILE_PATH'] = file_path
        
        # Persist settings
        root_path = Path(__file__).parent.parent.parent.parent
        Settings.save_key(current_app.config, root_path, 'STARTUP_FILE_PATH', file_path)
        
        return jsonify({
            'success': True,
            'enabled': bool(file_path),
            'file_path': file_path
        })
    else:
        file_path = current_app.config.get('STARTUP_FILE_PATH', '')
        return jsonify({
            'enabled': bool(file_path),
            'file_path': file_path
        })
