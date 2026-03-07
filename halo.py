"""Entry point for running HALO web application."""
import sys
import subprocess
from pathlib import Path


def check_dependencies():
    """Check if all required packages from requirements.txt are installed.
    
    Parses requirements.txt, checks each package via importlib.metadata,
    and runs 'pip install -r requirements.txt' if any are missing.
    Skips packages known to be platform-specific (e.g. uwsgi on Windows).
    """
    requirements_path = Path(__file__).parent / 'requirements.txt'
    if not requirements_path.exists():
        return
    
    # Packages that may not install on all platforms or are not needed locally
    SKIP_ON_WINDOWS = {'uwsgi', 'psycopg2-binary', 'boto3', 'bcrypt'}
    
    # Map pip package names to their importlib.metadata distribution names
    # (most are identical, but some differ)
    PACKAGE_NAME_MAP = {
        'python-dotenv': 'python-dotenv',
        'flask-cors': 'flask-cors',
        'psycopg2-binary': 'psycopg2-binary',
    }
    
    try:
        from importlib.metadata import distributions
        installed = {dist.metadata['Name'].lower() for dist in distributions()}
    except Exception:
        return  # Can't check, skip
    
    # Parse package names from requirements.txt
    missing = []
    with open(requirements_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # Extract package name (before any version specifier)
            pkg_name = line.split('>=')[0].split('<=')[0].split('==')[0].split('<')[0].split('>')[0].split('~=')[0].split('!=')[0].strip()
            if not pkg_name:
                continue
            # Skip platform-specific packages on Windows
            if sys.platform == 'win32' and pkg_name.lower() in SKIP_ON_WINDOWS:
                continue
            # Check if installed
            check_name = PACKAGE_NAME_MAP.get(pkg_name.lower(), pkg_name).lower()
            if check_name not in installed:
                missing.append(pkg_name)
    
    if missing:
        # Console messages before Flask/i18n init – English only (no i18n available at startup)
        print(f"Missing packages detected: {', '.join(missing)}")
        print("Installing missing packages ...")
        try:
            # Install only the missing packages (not the full requirements.txt,
            # which may contain platform-specific packages like uwsgi)
            subprocess.check_call([
                sys.executable, '-m', 'pip', 'install'] + missing)
            print("Dependencies installed successfully.")
            print()
        except subprocess.CalledProcessError as e:
            print(f"WARNING: pip install failed (exit code {e.returncode}).")
            print(f"Please run manually: pip install {' '.join(missing)}")
            print()


# Check dependencies before importing application modules (Local Mode only)
# In Cloud Mode (uWSGI), dependencies are managed by the deployment process
if __name__ == '__main__':
    check_dependencies()

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
