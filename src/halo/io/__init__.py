"""
I/O layer - File operations for observations and observers
"""

from .observers import (
    load_observers,
    save_observers,
    find_observer_records,
    add_observer_record,
    update_observer_record,
    delete_observer_record,
    get_observers_path
)

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

__all__ = [
    # Observer operations
    'load_observers',
    'save_observers',
    'find_observer_records',
    'add_observer_record',
    'update_observer_record',
    'delete_observer_record',
    'get_observers_path',
    # Observation file operations
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
    'delete_temp_file'
]

