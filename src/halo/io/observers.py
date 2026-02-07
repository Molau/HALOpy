"""
Observer file I/O operations for halobeo.csv

Centralizes all read/write operations for the observer database (halobeo.csv).
This module provides a single source of truth for observer data persistence.

Observer record format (CSV):
    KK,VName,NName,seit,active,HbOrt,GH,HLG,HLM,HOW,HBG,HBM,HNS,NbOrt,GN,NLG,NLM,NOW,NBG,NBM,NNS

    Fields:
        0: KK - Observer code (01-99)
        1: VName - First name
        2: NName - Last name
        3: seit - Start date (MM/YY format)
        4: active - Active status (1=active, 0=inactive)
        5: HbOrt - Primary observation site name
        6: GH - Primary site geographic region code (1-39)
        7: HLG - Primary site longitude degrees
        8: HLM - Primary site longitude minutes
        9: HOW - Primary site longitude hemisphere (O=East, W=West)
        10: HBG - Primary site latitude degrees
        11: HBM - Primary site latitude minutes
        12: HNS - Primary site latitude hemisphere (N=North, S=South)
        13: NbOrt - Secondary observation site name
        14: GN - Secondary site geographic region code
        15: NLG - Secondary site longitude degrees
        16: NLM - Secondary site longitude minutes
        17: NOW - Secondary site longitude hemisphere
        18: NBG - Secondary site latitude degrees
        19: NBM - Secondary site latitude minutes
        20: NNS - Secondary site latitude hemisphere

Sorting rules:
    - Primary: KK (observer code)
    - Secondary: seit date (chronological: YYYYMM)
    - Year conversion: YY < 50 → 20YY, YY ≥ 50 → 19YY
"""

import csv
from pathlib import Path
from typing import List, Tuple


def get_observers_path() -> Path:
    """
    Get the standard path to halobeo.csv file.
    
    Returns:
        Path: Full path to resources/halobeo.csv
    """
    # Navigate from src/halo/io/ to project root
    module_path = Path(__file__).resolve()
    project_root = module_path.parent.parent.parent.parent
    return project_root / 'resources' / 'halobeo.csv'


def load_observers(file_path: Path = None) -> List[List[str]]:
    """
    Load all observer records from halobeo.csv.
    
    Args:
        file_path: Path to CSV file (default: resources/halobeo.csv)
        
    Returns:
        List of observer records, where each record is a list of strings.
        Returns empty list if file doesn't exist.
        
    Example:
        >>> observers = load_observers()
        >>> for obs in observers:
        ...     print(f"Observer {obs[0]}: {obs[1]} {obs[2]}")
    """
    if file_path is None:
        file_path = get_observers_path()
    
    if not file_path.exists():
        return []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            return list(reader)
    except Exception as e:
        raise IOError(f"Failed to load observers from {file_path}: {str(e)}")


def save_observers(observers: List[List[str]], file_path: Path = None, sort: bool = True) -> None:
    """
    Save observer records to halobeo.csv with optional sorting.
    
    Args:
        observers: List of observer records (each record is a list of strings)
        file_path: Path to CSV file (default: resources/halobeo.csv)
        sort: If True, sort observers by KK and seit before saving (default: True)
        
    Raises:
        IOError: If file write fails
        
    Sorting:
        - Primary key: KK (observer code)
        - Secondary key: seit (start date, converted to YYYYMM for proper chronological sorting)
        - Year conversion: YY < 50 → 20YY, YY ≥ 50 → 19YY
        
    Example:
        >>> observers = load_observers()
        >>> observers.append(['44', 'John', 'Doe', '01/25', '1', ...])
        >>> save_observers(observers)  # Automatically sorted
    """
    if file_path is None:
        file_path = get_observers_path()
    
    # Sort observers if requested
    if sort and observers:
        observers = sorted(observers, key=_observer_sort_key)
    
    try:
        with open(file_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(observers)
    except Exception as e:
        raise IOError(f"Failed to save observers to {file_path}: {str(e)}")


def _observer_sort_key(obs: List[str]) -> Tuple[str, int]:
    """
    Generate sort key for observer record.
    
    Sorting logic:
        - Primary: KK (observer code, string comparison)
        - Secondary: seit date converted to numeric YYYYMM
    
    Args:
        obs: Observer record (list of strings)
        
    Returns:
        Tuple of (KK, seit_numeric) for sorting
    """
    kk = obs[0]  # Observer code
    seit = obs[3] if len(obs) > 3 else ''  # Start date (MM/YY)
    
    # Parse seit to numeric value for proper chronological sorting
    try:
        if seit and '/' in seit:
            parts = seit.split('/')
            if len(parts) == 2:
                month = int(parts[0])
                year = int(parts[1])
                # Convert to 4-digit year
                full_year = (2000 + year) if year < 50 else (1900 + year)
                # Return YYYYMM as numeric value
                return (kk, full_year * 100 + month)
    except (ValueError, IndexError):
        pass
    
    # Fallback: sort to beginning if seit is invalid
    return (kk, 0)


def find_observer_records(kk: str, observers: List[List[str]] = None) -> List[List[str]]:
    """
    Find all records for a specific observer.
    
    An observer may have multiple records (different observation sites over time).
    
    Args:
        kk: Observer code (will be normalized to 2 digits)
        observers: List of observer records (if None, loads from file)
        
    Returns:
        List of matching observer records
        
    Example:
        >>> records = find_observer_records('44')
        >>> for rec in records:
        ...     print(f"Site since {rec[3]}: {rec[5]}")
    """
    # Normalize KK to 2 digits
    kk = str(kk).zfill(2)
    
    if observers is None:
        observers = load_observers()
    
    return [obs for obs in observers if obs[0] == kk]


def add_observer_record(new_record: List[str], observers: List[List[str]] = None, 
                       save_to_file: bool = True) -> List[List[str]]:
    """
    Add a new observer record to the database.
    
    Args:
        new_record: Observer record to add (list of strings)
        observers: Existing observer records (if None, loads from file)
        save_to_file: If True, save to halobeo.csv immediately (default: True)
        
    Returns:
        Updated list of all observers (sorted)
        
    Raises:
        IOError: If save fails
        
    Example:
        >>> new_obs = ['44', 'John', 'Doe', '01/25', '1', 'Berlin', ...]
        >>> updated = add_observer_record(new_obs)
    """
    if observers is None:
        observers = load_observers()
    
    observers.append(new_record)
    
    if save_to_file:
        save_observers(observers, sort=True)
    
    # Return sorted list
    return sorted(observers, key=_observer_sort_key)


def update_observer_record(kk: str, seit: str, updated_fields: dict, 
                          observers: List[List[str]] = None, 
                          save_to_file: bool = True) -> Tuple[bool, List[List[str]]]:
    """
    Update a specific observer record.
    
    Args:
        kk: Observer code (2 digits)
        seit: Start date (MM/YY) to identify the record
        updated_fields: Dictionary of field_index → new_value
        observers: Existing observer records (if None, loads from file)
        save_to_file: If True, save to halobeo.csv immediately (default: True)
        
    Returns:
        Tuple of (success, updated_observers_list)
        
    Example:
        >>> # Update active status (field 4) for observer 44, site since 01/25
        >>> success, observers = update_observer_record('44', '01/25', {4: '0'})
    """
    kk = str(kk).zfill(2)
    
    if observers is None:
        observers = load_observers()
    
    found = False
    for i, obs in enumerate(observers):
        if obs[0] == kk and obs[3] == seit:
            # Apply updates
            for field_idx, value in updated_fields.items():
                if field_idx < len(obs):
                    obs[field_idx] = value
            observers[i] = obs
            found = True
            break
    
    if found and save_to_file:
        save_observers(observers, sort=True)
    
    return (found, observers)


def delete_observer_record(kk: str, seit: str = None, 
                          observers: List[List[str]] = None,
                          save_to_file: bool = True) -> Tuple[int, List[List[str]]]:
    """
    Delete observer record(s).
    
    Args:
        kk: Observer code (2 digits)
        seit: Start date (MM/YY) to delete specific record, or None to delete all records for observer
        observers: Existing observer records (if None, loads from file)
        save_to_file: If True, save to halobeo.csv immediately (default: True)
        
    Returns:
        Tuple of (deleted_count, updated_observers_list)
        
    Examples:
        >>> # Delete specific site entry
        >>> count, observers = delete_observer_record('44', '01/25')
        
        >>> # Delete all entries for observer
        >>> count, observers = delete_observer_record('44')
    """
    kk = str(kk).zfill(2)
    
    if observers is None:
        observers = load_observers()
    
    initial_count = len(observers)
    
    if seit is None:
        # Delete all records for this observer
        observers = [obs for obs in observers if obs[0] != kk]
    else:
        # Delete specific record
        observers = [obs for obs in observers if not (obs[0] == kk and obs[3] == seit)]
    
    deleted_count = initial_count - len(observers)
    
    if deleted_count > 0 and save_to_file:
        save_observers(observers, sort=True)
    
    return (deleted_count, observers)
