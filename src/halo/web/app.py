"""Flask application factory for HALO web application.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

from flask import Flask, render_template, session, request, g
from pathlib import Path
from halo.services.settings import Settings
from halo.config import is_cloud_mode


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
    app.config.update({
        'SECRET_KEY': 'dev-secret-key-change-in-production',
        'JSON_AS_ASCII': False,  # Support Unicode characters (umlauts)
        'INPUT_MODE': 'N',  # Default: N=Number entry, M=Menu entry
        'OUTPUT_MODE': 'P',  # Default: P=Pseudografik, H=HTML-Tabellen
        'DATE_DEFAULT_MODE': 'none',  # Default: none, current, previous, constant
        'DATE_DEFAULT_MONTH': 1,  # Month for constant mode
        'DATE_DEFAULT_YEAR': 2026,  # Year for constant mode
        'LOADED_FILE': None,
        'OBSERVATIONS': [],
        'OBSERVERS': [],  # Observer metadata from halobeo.csv
        'ACTIVE_OBSERVERS_ONLY': False,  # Setting: filter to active observers only
        'DIRTY': False,  # Track unsaved changes
        'UPDATE_REPO': 'Molau/Halo',  # GitHub repository for auto-updates
    })
    
    if config:
        app.config.update(config)
    
    # Load persisted settings from halo.cfg (CSV)
    Settings.load_into(app.config, root_path)
    
    # In cloud mode, always load all.csv at startup
    if is_cloud_mode():
        data_path = root_path / 'data' / 'all.csv'
        if data_path.exists():
            try:
                # OLD CODE - TO BE REMOVED AFTER TESTING
                # from halo.io.csv_handler import ObservationCSV
                # observations, needs_conversion = ObservationCSV.read_observations(data_path)
                # app.config['OBSERVATIONS'] = observations
                # app.config['LOADED_FILE'] = 'all.csv'
                # app.config['DIRTY'] = False  # Cloud mode auto-saves, never dirty
                # app.config['AUTO_LOADED'] = True
                # # Auto-save if converted from legacy format
                # if needs_conversion:
                #     ObservationCSV.write_observations(data_path, observations)
                
                # NEW CODE - Using io.observations_file
                import halo.io.observations_file as obs_file
                observations = obs_file.open_file('all.csv')
                app.config['OBSERVATIONS'] = observations
                app.config['LOADED_FILE'] = 'all.csv'
                app.config['DIRTY'] = False  # Cloud mode auto-saves, never dirty
                app.config['AUTO_LOADED'] = True
            except Exception as e:
                # If all.csv doesn't exist or fails, start with empty observations
                app.config['OBSERVATIONS'] = []
                app.config['LOADED_FILE'] = 'all.csv'
                app.config['DIRTY'] = False
        else:
            # Create empty all.csv if it doesn't exist
            app.config['OBSERVATIONS'] = []
            app.config['LOADED_FILE'] = 'all.csv'
            app.config['DIRTY'] = False
    else:
        # Local mode: Load startup file if configured
        startup_enabled = app.config.get('STARTUP_FILE_ENABLED', False)
        startup_file = app.config.get('STARTUP_FILE_PATH', '')
        
        if startup_enabled and startup_file:
            data_path = root_path / 'data' / startup_file
            if data_path.exists():
                try:
                    # OLD CODE - TO BE REMOVED AFTER TESTING
                    # # Import here to avoid circular imports
                    # from halo.io.csv_handler import ObservationCSV
                    # observations, needs_conversion = ObservationCSV.read_observations(data_path)
                    # app.config['OBSERVATIONS'] = observations
                    # app.config['LOADED_FILE'] = startup_file
                    # app.config['DIRTY'] = needs_conversion  # Mark dirty if converted from legacy format
                    # app.config['AUTO_LOADED'] = True  # Flag for showing notification
                    # # Auto-save if converted from legacy format
                    # if needs_conversion:
                    #     ObservationCSV.write_observations(data_path, observations)
                    #     app.config['DIRTY'] = False
                    
                    # NEW CODE - Using io.observations_file
                    import halo.io.observations_file as obs_file
                    observations = obs_file.open_file(startup_file)
                    app.config['OBSERVATIONS'] = observations
                    app.config['LOADED_FILE'] = startup_file
                    app.config['DIRTY'] = False  # open_file() handles conversion internally
                    app.config['AUTO_LOADED'] = True  # Flag for showing notification
                except Exception as e:
                    pass
            else:
                pass

    # Load observer metadata from resources/halobeo.csv
    from halo.io.observers import load_observers
    app.config['OBSERVERS'] = load_observers()
    
    # Initialize i18n
    from halo.resources import get_current_language, get_i18n, set_language
    
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
        # Skip authentication for login page, API login endpoint, and static files
        if (request.endpoint in ['login', 'api.login', 'static'] or 
            request.path.startswith('/static/')):
            return
        
        # In cloud mode, require authentication
        if is_cloud_mode():
            if not session.get('authenticated', False):
                # Redirect to login page
                from flask import redirect, url_for
                return redirect(url_for('login'))
            
            # Set FIXED_OBSERVER from session for cloud mode
            if session.get('observer_kk'):
                app.config['FIXED_OBSERVER'] = session.get('observer_kk')
    
    @app.context_processor
    def inject_i18n():
        """Make i18n functions available in all templates."""
        from halo.resources import get_string, get_language
        import time
        return {
            '_': get_string,  # Translation function (like gettext)
            'lang': get_language,  # Current language
            'i18n': g.i18n if hasattr(g, 'i18n') else get_i18n(),
            'static_version': int(time.time()),  # Cache-busting timestamp
            'update_repo': app.config.get('UPDATE_REPO', ''),
            'is_cloud': is_cloud_mode()  # Cloud mode flag for templates
        }
    
    # Register API blueprints
    from halo.api import api_blueprint
    from halo.api.update import update_blueprint
    app.register_blueprint(api_blueprint)
    app.register_blueprint(update_blueprint)
    
    # Web routes
    @app.route('/login')
    def login():
        """Login page (cloud mode only)."""
        if not is_cloud_mode():
            # Redirect to main page if not in cloud mode
            from flask import redirect, url_for
            return redirect(url_for('index'))
        return render_template('login.html')
    
    @app.route('/logout')
    def logout():
        """Logout current user."""
        session.clear()
        from flask import redirect, url_for
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
    print("Open your browser at: http://localhost:5000")
    print("Press Ctrl+C to stop")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)


if __name__ == '__main__':
    main()
