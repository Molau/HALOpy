"""Configuration and constants API endpoints.

Routes: /constants, /config, /config/setting

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
        VALID_HALO_TYPES,
        PHOTO_ALLOWED_EXTENSIONS,
        PHOTO_MAX_FILE_SIZE_BYTES,
        PHOTO_MAX_FILES_PER_OBSERVATION,
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
        },
        'photo_upload': {
            'allowed_extensions': list(PHOTO_ALLOWED_EXTENSIONS),
            'max_file_size_bytes': PHOTO_MAX_FILE_SIZE_BYTES,
            'max_files_per_observation': PHOTO_MAX_FILES_PER_OBSERVATION,
        },
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


@api_blueprint.route('/config/setting', methods=['GET', 'PUT'])
def generic_setting() -> Dict[str, Any]:
    """Generic GET/PUT for all config keys stored in halo.cfg.

    GET  /api/config/setting?key=INPUT_MODE   -> {"key": "INPUT_MODE", "value": "N"}
    PUT  /api/config/setting  {"key": "INPUT_MODE", "value": "M"}

    Allowed keys and their types are defined in ALLOWED_SETTINGS.
    FIXED_OBSERVER in cloud mode reads from session (set on login).
    """
    ALLOWED_SETTINGS: Dict[str, dict] = {
        'INPUT_MODE':           {'type': 'str',  'default': 'N'},
        'OUTPUT_MODE':          {'type': 'str',  'default': 'P'},
        'DATE_DEFAULT_MODE':    {'type': 'str',  'default': 'none'},
        'DATE_DEFAULT_MONTH':   {'type': 'int',  'default': 1},
        'DATE_DEFAULT_YEAR':    {'type': 'int',  'default': 2026},
        'FIXED_OBSERVER':       {'type': 'str',  'default': ''},
        'ACTIVE_OBSERVERS_ONLY': {'type': 'bool', 'default': False},
        'STARTUP_FILE_PATH':    {'type': 'str',  'default': ''},
        'SHOW_WARNINGS':        {'type': 'bool', 'default': True},
    }

    if request.method == 'PUT':
        data = request.get_json() or {}
        key = data.get('key', '')
        if key not in ALLOWED_SETTINGS:
            return jsonify({'error': f'Unknown setting: {key}'}), 400

        spec = ALLOWED_SETTINGS[key]
        raw = data.get('value', spec['default'])
        if spec['type'] == 'bool':
            value = bool(raw)
        elif spec['type'] == 'int':
            try:
                value = int(raw)
            except (ValueError, TypeError):
                value = spec['default']
        else:
            value = str(raw)

        current_app.config[key] = value
        root_path = Path(__file__).parent.parent.parent.parent
        if spec['type'] == 'bool':
            Settings.save_key(current_app.config, root_path, key, '1' if value else '0')
        else:
            Settings.save_key(current_app.config, root_path, key, str(value))

        return jsonify({'success': True, 'key': key, 'value': value})
    else:
        key = request.args.get('key', '')
        if key not in ALLOWED_SETTINGS:
            return jsonify({'error': f'Unknown setting: {key}'}), 400

        # FIXED_OBSERVER in cloud mode: read from session (set on login)
        if key == 'FIXED_OBSERVER' and is_cloud_mode():
            value = session.get('observer_kk', '')
        else:
            spec = ALLOWED_SETTINGS[key]
            raw = current_app.config.get(key, spec['default'])
            # Coerce to proper type (app_config may hold strings after save_key)
            if spec['type'] == 'bool':
                value = raw not in (False, '0', 0)
            elif spec['type'] == 'int':
                try:
                    value = int(raw)
                except (ValueError, TypeError):
                    value = spec['default']
            else:
                value = str(raw) if raw is not None else spec['default']

        return jsonify({'key': key, 'value': value})
