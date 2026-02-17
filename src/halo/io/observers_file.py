"""
Layer 3a: File Storage for Observer Data (halobeo.csv)

Pure file I/O operations - NO business logic.
This module handles CSV file reading/writing for observer records.

Responsibilities:
- CSV file read/write operations
- Path management (resources/halobeo.csv)
- Backup creation (halobeo.bak)
- File existence checks

Does NOT contain:
- Validation logic
- Sorting logic
- Record filtering or searching
- Any business rules

Usage:
    from halo.io import observers_file
    from halo.io.observers import sort_observers
    
    # Load
    records, path = observers_file.open_file()
    
    # Sort (Layer 2 business logic)
    records = sort_observers(records)
    
    # Save
    observers_file.save_file(records)
"""

import csv
import shutil
from pathlib import Path
from typing import Dict, List, Tuple, Optional


# Canonical field order for observer CSV files.
# Matches database column names in setup_database.sql.
OBSERVER_FIELDS = [
    'KK', 'VName', 'NName', 'seit', 'aktiv',
    'HbOrt', 'GH', 'HLG', 'HLM', 'HOW', 'HBG', 'HBM', 'HNS',
    'NbOrt', 'GN', 'NLG', 'NLM', 'NOW', 'NBG', 'NBM', 'NNS'
]


def get_default_path() -> Path:
    """
    Get the standard path to halobeo.csv file.
    
    Returns:
        Path: Full path to resources/halobeo.csv
    """
    # Navigate from src/halo/io/ to project root
    module_path = Path(__file__).resolve()
    project_root = module_path.parent.parent.parent.parent
    return project_root / 'resources' / 'halobeo.csv'


def get_backup_path() -> Path:
    """
    Get the path for backup file (halobeo.bak).
    
    Returns:
        Path: Full path to resources/halobeo.bak
    """
    return get_default_path().with_suffix('.bak')


def file_exists(file_path: Path = None) -> bool:
    """
    Check if observer file exists.
    
    Args:
        file_path: Path to check (default: halobeo.csv)
        
    Returns:
        bool: True if file exists
    """
    if file_path is None:
        file_path = get_default_path()
    return file_path.exists()


def open_file(file_path: Path = None) -> Tuple[List[Dict[str, str]], Path]:
    """
    Open observer file and read all records as dicts.
    
    Pure I/O operation - returns CSV data as list of dicts with
    column-name keys (KK, VName, NName, seit, aktiv, ...).
    
    Args:
        file_path: Path to CSV file (default: resources/halobeo.csv)
        
    Returns:
        Tuple of (records, full_path)
        - records: List of observer records (each is Dict[str, str])
        - full_path: Resolved absolute path to file
        
    Raises:
        IOError: If file read fails
        
    Example:
        >>> records, path = open_file()
        >>> print(f"Loaded {len(records)} records from {path}")
        >>> print(records[0]['KK'], records[0]['VName'])
    """
    if file_path is None:
        file_path = get_default_path()
    
    if not file_path.exists():
        return [], file_path
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            # Remove NULL characters that can cause PostgreSQL import issues
            content = f.read().replace('\x00', '')
            reader = csv.DictReader(content.splitlines(), fieldnames=OBSERVER_FIELDS)
            records = []
            for i, row in enumerate(reader):
                # Skip header row if present (KK value equals the field name)
                if i == 0 and row.get('KK', '') == 'KK':
                    continue
                records.append(dict(row))
        return records, file_path
    except Exception as e:
        raise IOError(f"Failed to read observers from {file_path}: {str(e)}")


def save_file(records: List[Dict[str, str]], file_path: Path = None) -> None:
    """
    Save observer records to CSV file with header row.
    
    Pure I/O operation - writes data as-is without sorting or validation.
    Creates backup (halobeo.bak) before writing if original file exists.
    
    Args:
        records: List of observer records (each is Dict[str, str])
        file_path: Path to CSV file (default: resources/halobeo.csv)
        
    Raises:
        IOError: If file write fails
        
    Note:
        Caller is responsible for sorting records before calling this function.
        Use observers.sort_observers() for business logic sorting.
        
        IMPORTANT: Sorting is ONLY needed for file storage (CSV has no inherent order).
        Database storage (Layer 3b) does NOT need sorting - SQL ORDER BY handles that.
        
    Example:
        >>> from halo.io.observers import sort_observers
        >>> records = sort_observers(records)  # Sort first (Layer 2)
        >>> save_file(records)  # Then save (Layer 3a)
    """
    if file_path is None:
        file_path = get_default_path()
    
    # Create backup before writing (always attempt)
    create_backup(file_path)
    
    try:
        with open(file_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=OBSERVER_FIELDS)
            writer.writeheader()
            writer.writerows(records)
    except Exception as e:
        raise IOError(f"Failed to write observers to {file_path}: {str(e)}")


def create_backup(file_path: Path = None) -> Optional[Path]:
    """
    Create backup of observer file as .bak.
    
    Copies file → file.bak, overwriting existing backup.
    
    Returns:
        Path: Path to backup file if created, None if original doesn't exist
        
    Raises:
        IOError: If backup creation fails
        
    Example:
        >>> backup_path = create_backup()
        >>> if backup_path:
        ...     print(f"Backup created: {backup_path}")
    """
    if file_path is None:
        file_path = get_default_path()
    
    if not file_path.exists():
        return None
    
    backup_path = file_path.with_suffix('.bak')
    
    try:
        shutil.copy2(file_path, backup_path)
        return backup_path
    except Exception as e:
        raise IOError(f"Failed to create backup from {file_path} to {backup_path}: {str(e)}")


def restore_from_backup() -> Optional[List[Dict[str, str]]]:
    """
    Restore observers from backup file (halobeo.bak).
    
    Reads backup file and returns records without modifying halobeo.csv.
    Caller must decide whether to save restored data.
    
    Returns:
        List of observer dicts if backup exists, None otherwise
        
    Raises:
        IOError: If backup read fails
        
    Example:
        >>> restored = restore_from_backup()
        >>> if restored:
        ...     save_file(restored)  # Restore to main file
    """
    backup_path = get_backup_path()
    
    if not backup_path.exists():
        return None
    
    try:
        with open(backup_path, 'r', encoding='utf-8') as f:
            # Remove NULL characters that can cause PostgreSQL import issues
            content = f.read().replace('\x00', '')
            reader = csv.DictReader(content.splitlines(), fieldnames=OBSERVER_FIELDS)
            records = []
            for i, row in enumerate(reader):
                # Skip header row if present
                if i == 0 and row.get('KK', '') == 'KK':
                    continue
                records.append(dict(row))
            return records
    except Exception as e:
        raise IOError(f"Failed to restore from backup {backup_path}: {str(e)}")


def backup_exists() -> bool:
    """
    Check if backup file (halobeo.bak) exists.
    
    Returns:
        bool: True if backup file exists
    """
    return get_backup_path().exists()
