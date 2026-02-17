"""
Layer 2: Observer Management (Business Logic)

Storage-agnostic observer operations - NO file I/O or database access.
This module provides business logic for observer record management.

Observer record format:
    Dict[str, str] with 21 fields (keys match CSV header / DB columns):
    
    KK     - Observer code (01-99)
    VName  - First name
    NName  - Last name
    seit   - Start date (MM/YY format)
    aktiv  - Active status (1=active, 0=inactive)
    HbOrt  - Primary observation site name
    GH     - Primary site geographic region code (1-39)
    HLG    - Primary site longitude degrees
    HLM    - Primary site longitude minutes
    HOW    - Primary site longitude hemisphere (O=East, W=West)
    HBG    - Primary site latitude degrees
    HBM    - Primary site latitude minutes
    HNS    - Primary site latitude hemisphere (N=North, S=South)
    NbOrt  - Secondary observation site name
    GN     - Secondary site geographic region code
    NLG    - Secondary site longitude degrees
    NLM    - Secondary site longitude minutes
    NOW    - Secondary site longitude hemisphere
    NBG    - Secondary site latitude degrees
    NBM    - Secondary site latitude minutes
    NNS    - Secondary site latitude hemisphere

Sorting rules:
    - Primary: KK (observer code)
    - Secondary: seit date (chronological: YYYYMM)
    - Year conversion: YY < YEAR_CUTOFF → 20YY, YY ≥ YEAR_CUTOFF → 19YY

Layer Architecture:
    - Layer 2: This module (storage-agnostic business logic)
    - Layer 3a: observers_file.py (File I/O)
    - Layer 3b: observers_db.py (Database I/O)

Usage:
    from halo.io import observers
    from halo.io import observers_file
    
    # Load from file (Layer 3a)
    records, path = observers_file.open_file()
    
    # Sort (Layer 2)
    records = observers.sort_observers(records)
    
    # Find (Layer 2)
    kk44_records = observers.find_observer_records('44', records)
    
    # Add (Layer 2)
    records = observers.add_observer_record(new_record, records)
    
    # Save to file (Layer 3a)
    observers_file.save_file(records)
"""

from typing import Dict, List, Tuple

from halo.models.constants import jj_to_full_year


def sort_observers(observers: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Sort observer records by KK and seit.
    
    Storage-agnostic business logic.
    
    Sorting rules:
        - Primary: KK (observer code, string comparison)
        - Secondary: seit date (chronological: YYYYMM numeric)
        - Year conversion: YY < YEAR_CUTOFF → 20YY, YY ≥ YEAR_CUTOFF → 19YY
    
    Args:
        observers: List of observer records (dicts)
        
    Returns:
        New list with sorted records
        
    Example:
        >>> observers = sort_observers(observers)
    """
    if not observers:
        return []
    
    return sorted(observers, key=_observer_sort_key)


def _observer_sort_key(obs: Dict[str, str]) -> Tuple[str, int]:
    """
    Generate sort key for observer record.
    
    Internal helper for sort_observers().
    
    Sorting logic:
        - Primary: KK (observer code, string comparison)
        - Secondary: seit date converted to numeric YYYYMM
    
    Args:
        obs: Observer record (dict)
        
    Returns:
        Tuple of (KK, seit_numeric) for sorting
    """
    kk = obs.get('KK', '')
    seit = obs.get('seit', '')
    
    # Parse seit to numeric value for proper chronological sorting
    try:
        if seit and '/' in seit:
            parts = seit.split('/')
            if len(parts) == 2:
                month = int(parts[0])
                year = int(parts[1])
                # Convert to 4-digit year
                full_year = jj_to_full_year(year)
                # Return YYYYMM as numeric value
                return (kk, full_year * 100 + month)
    except (ValueError, IndexError):
        pass
    
    # Fallback: sort to beginning if seit is invalid
    return (kk, 0)


def find_observer_records(kk: str, observers: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Find all records for a specific observer.
    
    Storage-agnostic business logic.
    An observer may have multiple records (different observation sites over time).
    
    Args:
        kk: Observer code (will be normalized to 2 digits)
        observers: List of all observer records
        
    Returns:
        List of matching observer records
        
    Example:
        >>> records = find_observer_records('44', all_observers)
        >>> for rec in records:
        ...     print(f"Site since {rec['seit']}: {rec['HbOrt']}")
    """
    # Normalize KK to 2 digits
    kk_normalized = str(kk).zfill(2)
    
    return [obs for obs in observers if obs.get('KK', '') == kk_normalized]


def add_observer_record(new_record: Dict[str, str], observers: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Add a new observer record to the collection.
    
    Storage-agnostic business logic - does NOT save to file/database.
    
    Args:
        new_record: Observer record to add (dict)
        observers: Existing observer records
        
    Returns:
        New list with all observers including the new record (sorted)
        
    Note:
        Caller must save to storage (file or database) if needed.
        
    Example:
        >>> new_obs = {'KK': '44', 'VName': 'John', 'NName': 'Doe', 'seit': '01/25', ...}
        >>> observers = add_observer_record(new_obs, observers)
        >>> # Then save: observers_file.save_file(observers)
    """
    updated = observers.copy()
    updated.append(new_record)
    return sort_observers(updated)


def update_observer_record(kk: str, seit: str, updated_fields: Dict[str, str], 
                          observers: List[Dict[str, str]]) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Update a specific observer record in the collection.
    
    Storage-agnostic business logic - does NOT save to file/database.
    
    Args:
        kk: Observer code (2 digits)
        seit: Start date (MM/YY) to identify the record
        updated_fields: Dictionary of field_name → new_value (e.g. {'aktiv': '0'})
        observers: Existing observer records
        
    Returns:
        Tuple of (success, updated_observers_list)
        
    Note:
        Caller must save to storage (file or database) if needed.
        
    Example:
        >>> # Update active status for observer 44, site since 01/25
        >>> success, observers = update_observer_record('44', '01/25', {'aktiv': '0'}, observers)
        >>> if success:
        ...     observers_file.save_file(observers)
    """
    kk_normalized = str(kk).zfill(2)
    
    updated = [obs.copy() for obs in observers]
    found = False
    
    for i, obs in enumerate(updated):
        if obs.get('KK', '') == kk_normalized and obs.get('seit', '') == seit:
            # Apply updates
            for field_name, value in updated_fields.items():
                obs[field_name] = value
            updated[i] = obs
            found = True
            break
    
    return (found, updated)


def delete_observer_record(kk: str, seit: str, 
                          observers: List[Dict[str, str]]) -> Tuple[int, List[Dict[str, str]]]:
    """
    Delete observer record(s) from the collection.
    
    Storage-agnostic business logic - does NOT save to file/database.
    
    Args:
        kk: Observer code (2 digits)
        seit: Start date (MM/YY) to delete specific record, or None to delete all records for observer
        observers: Existing observer records
        
    Returns:
        Tuple of (deleted_count, updated_observers_list)
        
    Note:
        Caller must save to storage (file or database) if needed.
        
    Examples:
        >>> # Delete specific site entry
        >>> count, observers = delete_observer_record('44', '01/25', observers)
        >>> if count > 0:
        ...     observers_file.save_file(observers)
        
        >>> # Delete all entries for observer
        >>> count, observers = delete_observer_record('44', None, observers)
    """
    kk_normalized = str(kk).zfill(2)
    
    initial_count = len(observers)
    
    if seit is None:
        # Delete all records for this observer
        updated = [obs for obs in observers if obs.get('KK', '') != kk_normalized]
    else:
        # Delete specific record
        updated = [obs for obs in observers 
                  if not (obs.get('KK', '') == kk_normalized and obs.get('seit', '') == seit)]
    
    deleted_count = initial_count - len(updated)
    
    return (deleted_count, updated)
