# Standard library imports
import csv
from pathlib import Path
from typing import Dict, Any

# Third-party imports
from flask import session

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
        if is_cloud_mode() and observer_kk is not None:
            # observer_kk='admin' for admin user, or KK number for regular users
            filename = f'halo.{observer_kk}.cfg'
        else:
            filename = Settings.DEFAULT_FILENAME
        
        return resources_dir / filename

    @staticmethod
    def load_into(app_config: Dict[str, Any], root_path: Path) -> None:
        # Cloud Mode: get observer KK from session (set on login, per-user security)
        # Local Mode: get observer KK from app_config (optional UI filter, single-user)
        observer_kk = None
        if is_cloud_mode():
            if 'observer_kk' not in session:
                # No observer set yet (before login) - skip loading config
                return
            raw_kk = session.get('observer_kk')
            # Admin user has observer_kk=None → use 'admin' as config identifier
            observer_kk = str(raw_kk) if raw_kk is not None else 'admin'
        else:
            # Local Mode: Read optional fixed observer from app_config
            observer_kk = app_config.get('FIXED_OBSERVER', '')
        
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
                    elif key == 'LANGUAGE':
                        # Saved language preference (de or en)
                        app_config['LANGUAGE'] = value if value in ('de', 'en') else 'de'
                    elif key == 'SHOW_WARNINGS':
                        app_config['SHOW_WARNINGS'] = value not in ('0', 'false', 'False')
        except Exception:
            # On any error, keep existing defaults
            pass

    @staticmethod
    def save_from(app_config: Dict[str, Any], root_path: Path) -> None:
        # Cloud Mode: get observer KK from session (set on login, per-user)
        # Local Mode: get observer KK from app_config (optional UI filter)
        observer_kk = None
        if is_cloud_mode():
            if 'observer_kk' not in session:
                # No observer set yet (before login) - skip saving config
                return
            raw_kk = session.get('observer_kk')
            # Admin user has observer_kk=None → use 'admin' as config identifier
            observer_kk = str(raw_kk) if raw_kk is not None else 'admin'
        else:
            # Local Mode: Read optional fixed observer from app_config
            observer_kk = app_config.get('FIXED_OBSERVER', '')
        
        cfg_file = Settings._cfg_path(root_path, observer_kk)
        
        rows = [
            ['INPUT_MODE', app_config.get('INPUT_MODE', 'N')],
            ['OUTPUT_MODE', app_config.get('OUTPUT_MODE', 'P')],
            ['ACTIVE_OBSERVERS_ONLY', '1' if app_config.get('ACTIVE_OBSERVERS_ONLY', False) else '0'],
            ['DATE_DEFAULT_MODE', app_config.get('DATE_DEFAULT_MODE', 'none')],
            ['DATE_DEFAULT_MONTH', str(app_config.get('DATE_DEFAULT_MONTH', 1))],
            ['DATE_DEFAULT_YEAR', str(app_config.get('DATE_DEFAULT_YEAR', 2026))],
            ['LANGUAGE', app_config.get('LANGUAGE', 'de')],
            ['SHOW_WARNINGS', '1' if app_config.get('SHOW_WARNINGS', True) else '0'],
        ]
        # Local Mode only: FIXED_OBSERVER, file operations
        if not is_cloud_mode():
            rows.insert(3, ['FIXED_OBSERVER', app_config.get('FIXED_OBSERVER', '')])
            rows.append(['STARTUP_FILE_PATH', app_config.get('STARTUP_FILE_PATH', '')])
        
        with open(cfg_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(rows)

    @staticmethod
    def save_key(app_config: Dict[str, Any], root_path: Path, key: str, value: Any) -> None:
        # Update app_config, then write full set
        app_config[key] = value
        Settings.save_from(app_config, root_path)


