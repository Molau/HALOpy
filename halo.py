"""Entry point for running HALO web application."""
import sys
from pathlib import Path

# Add src directory to Python path
src_path = Path(__file__).parent / 'src'
sys.path.insert(0, str(src_path))

from halo.config import get_deployment_mode, is_cloud_mode
from halo.web.app import create_app, main

# Create Flask app instance for WSGI servers (uWSGI, Gunicorn, etc.)
app = create_app()

# Alias for uWSGI default callable name
application = app

if __name__ == '__main__':
    # Detect deployment mode
    deployment_mode = get_deployment_mode()
    print(f"HALOpy Deployment Mode: {deployment_mode.upper()}")
    if is_cloud_mode():
        print("Running in CLOUD mode")
    else:
        print("Running in LOCAL mode")
    print()
    
    main()
