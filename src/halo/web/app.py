"""Flask application factory for HALO web application.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

# Standard library imports
import os
import threading
import time
import webbrowser
from pathlib import Path

# Third-party imports
from flask import Flask, render_template, session, request, g, redirect, url_for, jsonify
from flask_cors import CORS

# Project imports
from halo.api import api_blueprint
from halo.api.update import update_blueprint
from halo.config import is_cloud_mode
from halo.resources import get_current_language, get_i18n, set_language, get_string, get_language
from halo.services.settings import Settings
import halo.io.observations_file as obs_file
import halo.io.observers_file as observer_file
import halo.io.observers_db as observer_db
from halo.web.extensions import csrf, limiter


def create_app(config=None):
    """
    Create and configure Flask application.
    
    Args:
        config: Optional configuration dictionary
        
    Returns:
        Configured Flask application
    """
    # Define paths
    root_path = Path(__file__).parent.parent.parent.parent
    template_folder = root_path / 'templates'
    static_folder = root_path / 'static'
    
    # Create Flask app
    app = Flask(
        __name__,
        template_folder=str(template_folder),
        static_folder=str(static_folder)
    )
    
    # Load configuration
    base_config = {
        'SECRET_KEY': 'dev-secret-key-change-in-production',
        'JSON_AS_ASCII': False,  # Support Unicode characters (umlauts)
        'INPUT_MODE': 'N',  # Default: N=Number entry, M=Menu entry
        'OUTPUT_MODE': 'P',  # Default: P=Pseudografik, H=HTML-Tabellen
        'DATE_DEFAULT_MODE': 'none',  # Default: none, current, previous, constant
        'DATE_DEFAULT_MONTH': 1,  # Month for constant mode
        'DATE_DEFAULT_YEAR': 2026,  # Year for constant mode
        'LOADED_FILE': None,
        'OBSERVATIONS': [],
        'ACTIVE_OBSERVERS_ONLY': False,  # Setting: filter to active observers only
        'DIRTY': False,  # Track unsaved changes
        'UPDATE_REPO': 'Molau/Halo',  # GitHub repository for auto-updates
    }
    
    # Add OBSERVERS only in Local Mode (Cloud Mode must use database directly)
    if not is_cloud_mode():
        base_config['OBSERVERS'] = []  # Observer metadata from halobeo.csv (Local Mode only)
    
    app.config.update(base_config)
    
    if config:
        app.config.update(config)
    
    # Enable CORS for Upload/Download APIs
    # Allows Local Mode (localhost) to access Cloud Server APIs
    CORS(app, resources={
        r"/api/file/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": False
        },
        r"/api/observers/upload": {
            "origins": "*",
            "methods": ["POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": False
        },
        r"/api/observers/download": {
            "origins": "*",
            "methods": ["POST", "OPTIONS"],
            "allow_headers": ["Content-Type"],
            "supports_credentials": False
        }
    })
    
    # CSRF Protection (Cloud Mode uses session-based auth → needs CSRF)
    csrf.init_app(app)
    
    # Rate-Limiting (protects auth endpoints against brute-force)
    limiter.init_app(app)
    
    # Session timeout: 12 hours
    from datetime import timedelta
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)
    
    # Load persisted settings from halo.cfg (CSV)
    # Cloud Mode: Settings loaded per-request (need session context)
    # Local Mode: Load settings during app initialization
    if not is_cloud_mode():
        Settings.load_into(app.config, root_path)
    
    # Observation loading at startup
    # - Cloud mode: Observations loaded on-demand from database (no startup load)
    # - Local mode: Optional auto-load from configured startup file
    
    if not is_cloud_mode():
        # Local mode: Load startup file if configured
        startup_file = app.config.get('STARTUP_FILE_PATH', '')
        
        if startup_file:
            try:
                observations, filepath = obs_file.open_file(startup_file)
                app.config['OBSERVATIONS'] = observations
                app.config['LOADED_FILE'] = filepath.name
                app.config['DIRTY'] = False
                app.config['AUTO_LOADED'] = True  # Flag for showing notification
            except Exception as e:
                pass
    
    # Load observer metadata
    if is_cloud_mode():
        # Cloud Mode: Don't cache observers - access database directly in each API call
        # NO FALLBACK: If code tries to access app.config['OBSERVERS'], it should fail explicitly
        pass  # Keep OBSERVERS undefined to catch incorrect usage
    else:
        # Local Mode: Load observers from resources/halobeo.csv (Layer 3a)
        observers, _ = observer_file.open_file()
        app.config['OBSERVERS'] = observers
    
    @app.before_request
    def setup_language():
        """Set up language for each request."""
        # Initialize session language if not set
        if 'language' not in session:
            # Try saved language from settings first
            saved_lang = app.config.get('LANGUAGE', '')
            if saved_lang in ('de', 'en'):
                session['language'] = saved_lang
            else:
                # Fall back to browser detection
                browser_lang = request.accept_languages.best_match(['de', 'en'])
                session['language'] = browser_lang or 'de'
        
        # Apply language to i18n system
        current_lang = session.get('language', 'de')
        set_language(current_lang)
        
        # Store current language in g for easy template access
        g.language = current_lang
        g.i18n = get_i18n(current_lang)
    
    @app.before_request
    def check_authentication():
        """Check authentication for cloud mode."""
        # Skip authentication for login page, API login endpoint, language switching, upload/download APIs, and static files
        if (request.endpoint in ['login', 'api.login', 'api.set_language', 'api.get_language', 'static'] or 
            request.path.startswith('/static/') or
            request.path.startswith('/api/language/') or
            request.path.startswith('/api/file/') or
            request.path.startswith('/api/observers/list') or  # Public endpoint for login dropdown
            request.path.startswith('/api/observers/upload') or
            request.path.startswith('/api/observers/download')):
            return
        
        # In cloud mode, require authentication
        if is_cloud_mode():
            if not session.get('authenticated', False):
                # API endpoints get 401 JSON; web pages get redirect to login
                if request.path.startswith('/api/'):
                    return jsonify({'success': False, 'error': 'not_authenticated'}), 401
                return redirect(url_for('login'))
            
            # Load user-specific settings after authentication
            # This needs session context, so we do it here instead of in create_app()
            if not hasattr(g, 'settings_loaded'):
                Settings.load_into(app.config, root_path)
                g.settings_loaded = True
    
    @app.context_processor
    def inject_i18n():
        """Make i18n functions available in all templates."""
        return {
            '_': get_string,  # Translation function (like gettext)
            'lang': get_language,  # Current language
            'i18n': g.i18n if hasattr(g, 'i18n') else get_i18n(),
            'static_version': int(time.time()),  # Cache-busting timestamp
            'update_repo': '' if is_cloud_mode() else app.config.get('UPDATE_REPO', ''),
            'is_cloud': is_cloud_mode()  # Cloud mode flag for templates
        }
    
    # Register API blueprints
    app.register_blueprint(api_blueprint)
    app.register_blueprint(update_blueprint)
    
    # Web routes
    @app.route('/login')
    def login():
        """Login page (cloud mode only)."""
        if not is_cloud_mode():
            # Redirect to main page if not in cloud mode
            return redirect(url_for('index'))
        return render_template('login.html')
    
    @app.route('/logout')
    def logout():
        """Logout current user."""
        session.clear()
        if is_cloud_mode():
            return redirect(url_for('login'))
        return redirect(url_for('index'))
    
    @app.route('/')
    def index():
        """Main page."""
        return render_template('index.html')
    
    @app.after_request
    def add_header(response):
        """Add headers to prevent caching of static files in development."""
        if app.debug:
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0, max-age=0'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '-1'
        return response
    
    @app.route('/observations')
    def observations():
        """Observations browser page."""
        return render_template('observations.html')
    
    @app.route('/observers')
    def observers():
        """Observers browser page."""
        return render_template('observers.html')
    
    @app.route('/monthly-report')
    def monthly_report():
        """Monthly report (Monatsmeldung) page."""
        return render_template('monthly_report.html')
    
    @app.route('/monthly-stats')
    def monthly_stats():
        """Monthly statistics (Monatsstatistik) page."""
        return render_template('monthly_stats.html')
    
    @app.route('/annual-stats')
    def annual_stats():
        """Annual statistics (Jahresstatistik) page."""
        return render_template('annual_stats.html')
    
    @app.route('/analysis')
    def analysis():
        """Analysis (Auswertung) page."""
        return render_template('analysis.html')
    
    @app.route('/statistics')
    def statistics():
        """Statistics and analysis page."""
        return render_template('statistics.html')
    
    @app.route('/about')
    def about():
        """About page."""
        return render_template('about.html')
    
    return app


def main():
    """Run development server."""
    app = create_app()
    print("=" * 60)
    print("HALO Web Application")
    print("=" * 60)
    print("Starting development server...")
    print("http://localhost:5000")
    print("Press Ctrl+C to stop")
    print("=" * 60)

    # Always open a new browser window on server start.
    # The Werkzeug reloader guard prevents double-open in debug mode.
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        threading.Timer(1.5, lambda: webbrowser.open('http://localhost:5000', new=1, autoraise=True)).start()

    app.run(host='0.0.0.0', port=5000, debug=True)


if __name__ == '__main__':
    main()
