# Standard library imports
import base64
import csv
from pathlib import Path
from typing import Dict, Any

# Project imports
from halo.config import is_cloud_mode


class Settings:
    """Simple CSV-backed settings store compatible with halo.cfg.

    Format:
        key,value\n
        Example keys:
            - INPUT_MODE: 'M' or 'N'
            - OUTPUT_MODE: 'H', 'P', or 'M'
            - ACTIVE_OBSERVERS_ONLY: '0' or '1'
    """

    DEFAULT_FILENAME = 'halo.cfg'

    @staticmethod
    def _cfg_path(root_path: Path, observer_kk: str = None) -> Path:
        """
        Get path to configuration file.
        
        In cloud mode: Uses user-specific config file halo.KK.cfg (e.g., halo.44.cfg)
        In local mode: Uses shared config file halo.cfg
        
        Args:
            root_path: Application root path
            observer_kk: Observer kennung (only used in cloud mode)
        
        Returns:
            Path to configuration file
        """
        # Store cfg in resources folder alongside halobeo.csv (metadata, not observation data)
        resources_dir = root_path / 'resources'
        resources_dir.mkdir(parents=True, exist_ok=True)
        
        # In cloud mode, use user-specific config file
        if is_cloud_mode() and observer_kk:
            filename = f'halo.{observer_kk}.cfg'
        else:
            filename = Settings.DEFAULT_FILENAME
        
        return resources_dir / filename

    @staticmethod
    def load_into(app_config: Dict[str, Any], root_path: Path) -> None:
        # In cloud mode, get observer KK from FIXED_OBSERVER
        observer_kk = None
        if is_cloud_mode():
            observer_kk = app_config.get('FIXED_OBSERVER', '')
            if not observer_kk:
                # No observer set yet (before login) - skip loading config
                return
        
        cfg_file = Settings._cfg_path(root_path, observer_kk)
        if not cfg_file.exists():
            # Create with current defaults
            Settings.save_from(app_config, root_path)
            return

        try:
            with open(cfg_file, 'r', encoding='utf-8', newline='') as f:
                reader = csv.reader(f)
                for row in reader:
                    if len(row) < 2:
                        continue
                    key, value = row[0], row[1]
                    if key == 'INPUT_MODE':
                        app_config['INPUT_MODE'] = value if value in ('M', 'N') else app_config.get('INPUT_MODE', 'N')
                    elif key == 'OUTPUT_MODE':
                        app_config['OUTPUT_MODE'] = value if value in ('H', 'P', 'M') else app_config.get('OUTPUT_MODE', 'P')
                    elif key == 'ACTIVE_OBSERVERS_ONLY':
                        app_config['ACTIVE_OBSERVERS_ONLY'] = value in ('1', 'true', 'True')
                    elif key == 'FIXED_OBSERVER':
                        # In cloud mode, FIXED_OBSERVER is controlled by login, not loaded from config
                        if not is_cloud_mode():
                            app_config['FIXED_OBSERVER'] = value
                    elif key == 'STARTUP_FILE_ENABLED':
                        app_config['STARTUP_FILE_ENABLED'] = value in ('1', 'true', 'True')
                    elif key == 'STARTUP_FILE_PATH':
                        app_config['STARTUP_FILE_PATH'] = value
                    elif key == 'DATE_DEFAULT_MODE':
                        app_config['DATE_DEFAULT_MODE'] = value if value in ('none', 'current', 'previous', 'constant') else 'none'
                    elif key == 'DATE_DEFAULT_MONTH':
                        try:
                            app_config['DATE_DEFAULT_MONTH'] = int(value)
                        except ValueError:
                            app_config['DATE_DEFAULT_MONTH'] = 1
                    elif key == 'DATE_DEFAULT_YEAR':
                        try:
                            app_config['DATE_DEFAULT_YEAR'] = int(value)
                        except ValueError:
                            app_config['DATE_DEFAULT_YEAR'] = 2026
                    elif key == 'UPLOAD_PASSWORD':
                        app_config['UPLOAD_PASSWORD'] = value
                    elif key == 'LANGUAGE':
                        # Saved language preference (de or en)
                        app_config['LANGUAGE'] = value if value in ('de', 'en') else 'de'
        except Exception:
            # On any error, keep existing defaults
            pass

    @staticmethod
    def save_from(app_config: Dict[str, Any], root_path: Path) -> None:
        # In cloud mode, get observer KK from FIXED_OBSERVER
        observer_kk = None
        if is_cloud_mode():
            observer_kk = app_config.get('FIXED_OBSERVER', '')
            if not observer_kk:
                # No observer set yet (before login) - skip saving config
                return
        
        cfg_file = Settings._cfg_path(root_path, observer_kk)
        rows = [
            ['INPUT_MODE', app_config.get('INPUT_MODE', 'N')],
            ['OUTPUT_MODE', app_config.get('OUTPUT_MODE', 'P')],
            ['ACTIVE_OBSERVERS_ONLY', '1' if app_config.get('ACTIVE_OBSERVERS_ONLY', False) else '0'],
            ['STARTUP_FILE_ENABLED', '1' if app_config.get('STARTUP_FILE_ENABLED', False) else '0'],
            ['STARTUP_FILE_PATH', app_config.get('STARTUP_FILE_PATH', '')],
            ['DATE_DEFAULT_MODE', app_config.get('DATE_DEFAULT_MODE', 'none')],
            ['DATE_DEFAULT_MONTH', str(app_config.get('DATE_DEFAULT_MONTH', 1))],
            ['DATE_DEFAULT_YEAR', str(app_config.get('DATE_DEFAULT_YEAR', 2026))],
            ['UPLOAD_PASSWORD', app_config.get('UPLOAD_PASSWORD', '')],
            ['LANGUAGE', app_config.get('LANGUAGE', 'de')],
        ]
        # In cloud mode, FIXED_OBSERVER is not saved to config (controlled by login)
        if not is_cloud_mode():
            rows.insert(3, ['FIXED_OBSERVER', app_config.get('FIXED_OBSERVER', '')])
        
        with open(cfg_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)

    @staticmethod
    def save_key(app_config: Dict[str, Any], root_path: Path, key: str, value: Any) -> None:
        # Update app_config, then write full set
        app_config[key] = value
        Settings.save_from(app_config, root_path)

    @staticmethod
    def obfuscate(text: str) -> str:
        """Simple obfuscation using base64 and character shift."""
        # Shift characters by 13 (simple ROT13-like)
        shifted = ''.join(chr(ord(c) + 13) for c in text)
        # Base64 encode
        encoded = base64.b64encode(shifted.encode('utf-8')).decode('utf-8')
        return encoded

    @staticmethod
    def deobfuscate(text: str) -> str:
        """Reverse the obfuscation."""
        try:
            # Base64 decode
            decoded = base64.b64decode(text.encode('utf-8')).decode('utf-8')
            # Reverse character shift
            unshifted = ''.join(chr(ord(c) - 13) for c in decoded)
            return unshifted
        except Exception:
            return ''
