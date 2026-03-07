"""General utility API endpoints.

Routes: /health, /language, /i18n, /whats-new, /help

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

from pathlib import Path
from typing import Dict, Any

from flask import jsonify, current_app, session, make_response

from halo import __version__
from halo.api import api_blueprint
from halo.config import is_cloud_mode
from halo.io import db_connection
from halo.resources import I18n, set_language as set_lang
from halo.resources.i18n import get_i18n


@api_blueprint.route('/health', methods=['GET'])
def health_check() -> Dict[str, Any]:
    """Health check endpoint for monitoring and load balancers.
    
    Returns:
        JSON response with status, database connectivity, and version info.
        - 200: OK - all systems operational
        - 503: Service Unavailable - database connection failed
    """
    status = {
        'status': 'ok',
        'version': __version__,
        'service': 'HALO API',
        'mode': 'cloud' if is_cloud_mode() else 'local'
    }
    
    # Test database connection in cloud mode
    if is_cloud_mode():
        try:
            # Test database connection using shared connection module
            db_ok = db_connection.test_connection()
            status['database'] = 'connected' if db_ok else 'disconnected'
            
            if not db_ok:
                status['status'] = 'degraded'
                return jsonify(status), 503
                
        except Exception as e:
            status['status'] = 'error'
            status['database'] = 'error'
            status['error'] = str(e)
            return jsonify(status), 503
    else:
        status['database'] = 'file-based'
    
    return jsonify(status), 200


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
    
    # Update app config (so it persists across page reloads)
    current_app.config['LANGUAGE'] = lang
    
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
