"""
I/O layer - File and Database operations for observations and observers

Architecture:
- Layer 2: observers.py, observations.py (Business Logic)
- Layer 3a: observers_file.py, observations_file.py (File Storage)
- Layer 3b: observers_db.py, observations_db.py (Database Storage)
"""

# Database Connection (shared)
from . import db_connection

# Observer Layer 2 (Business Logic)
from .observers import (
    sort_observers,
    find_observer_records,
    add_observer_record,
    update_observer_record,
    delete_observer_record
)

# Observer Layer 3a (File Storage)
from .observers_file import (
    OBSERVER_FIELDS,
    get_default_path as get_observers_path,
    get_backup_path as get_observers_backup_path,
    file_exists as observer_file_exists,
    open_file as open_observer_file,
    save_file as save_observer_file,
    create_backup as create_observer_backup,
    restore_from_backup as restore_observer_backup,
    backup_exists as observer_backup_exists
)

# Observation Layer 3a (File Storage)
from .observations_file import (
    # File operations
    new_file,
    open_file,
    save_file,
    delete_file,
    rename_file,
    file_exists,
    list_files,
    # Path utilities
    get_data_path,
    get_temp_path,
    # Temp operations
    create_temp_backup,
    restore_from_temp,
    clean_temp_files,
    delete_temp_file
)

# Layer 3b (Database Storage) - import entire modules
from . import observations_db
from . import observers_db

__all__ = [
    # Database Connection (Layer 3b shared)
    'db_connection',
    # Observer Layer 2 (Business Logic)
    'sort_observers',
    'find_observer_records',
    'add_observer_record',
    'update_observer_record',
    'delete_observer_record',
    # Observer Layer 3a (File Storage)
    'OBSERVER_FIELDS',
    'get_observers_path',
    'get_observers_backup_path',
    'observer_file_exists',
    'open_observer_file',
    'save_observer_file',
    'create_observer_backup',
    'restore_observer_backup',
    'observer_backup_exists',
    # Observation file operations (Layer 3a)
    'new_file',
    'open_file',
    'save_file',
    'delete_file',
    'rename_file',
    'file_exists',
    'list_files',
    # Path utilities
    'get_data_path',
    'get_temp_path',
    # Temp operations
    'create_temp_backup',
    'restore_from_temp',
    'clean_temp_files',
    'delete_temp_file',
    # Database modules (Layer 3b)
    'observations_db',
    'observers_db'
]

