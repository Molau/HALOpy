"""
Observation data management layer (storage-agnostic)

This module provides business logic for observation collections WITHOUT knowing
about the underlying storage (file, database, etc.). All functions work with
in-memory List[Dict[str, str]] collections.

Responsibilities:
    - Collection management (add, update, delete, filter)
    - Sorting by HALO standard
    - Merging and deduplication
    - Format conversion (legacy → modern)
    - Validation

Does NOT handle:
    - File I/O (that's observations_file.py)
    - Database I/O (that's observations_db.py)
    - CSV parsing (that's csv_handler.py)
"""

from typing import List, Optional, Tuple, Dict, Any, Callable
from halo.models.constants import jj_to_full_year


# ============================================================================
# Helpers
# ============================================================================

def _int(obs: Dict[str, str], key: str, default: int = 0) -> int:
    """Safely convert observation field to int, returning default for empty/missing."""
    val = obs.get(key, '')
    if val == '' or val == '/' or val == '//':
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


# ============================================================================
# Key Management
# ============================================================================

def make_observation_key(obs: Dict[str, str]) -> Tuple[int, int, int, int, int, int, int, int, int]:
    """
    Create unique key tuple for observation.
    
    Key fields: (KK, O, JJ, MM, TT, g, ZS, ZM, EE)
    
    g (location) is included because the same observer can report the same
    halo type on the same day from different sites (g=0 primary, g=2 secondary).
    ZS/ZM (time) are included because the same observer can report the same
    halo type on the same day at different times (e.g. morning and afternoon).
    
    Args:
        obs: Observation dict
        
    Returns:
        Tuple of 9 integers representing the unique key
        
    Example:
        >>> key = make_observation_key(obs)
        >>> key
        (44, 1, 25, 1, 15, 0, 12, 30, 22)
    """
    return (_int(obs, 'KK'), _int(obs, 'O'), _int(obs, 'JJ'),
            _int(obs, 'MM'), _int(obs, 'TT'), _int(obs, 'g'),
            _int(obs, 'ZS'), _int(obs, 'ZM'), _int(obs, 'EE'))


def observation_matches_key(obs: Dict[str, str], key: Tuple) -> bool:
    """
    Check if observation matches the given key.
    
    Args:
        obs: Observation to check
        key: Key tuple (KK, O, JJ, MM, TT, g, ZS, ZM, EE)
        
    Returns:
        True if observation matches key
    """
    return make_observation_key(obs) == key


# ============================================================================
# Single Observation Operations
# ============================================================================

def find_observation(collection: List[Dict[str, str]], key: Tuple) -> Optional[Dict[str, str]]:
    """
    Find observation in collection by key.
    
    Args:
        collection: List of observations
        key: Key tuple (KK, O, JJ, MM, TT, g, ZS, ZM, EE)
        
    Returns:
        Observation if found, None otherwise
        
    Example:
        >>> obs = find_observation(observations, (44, 1, 25, 1, 15, 0, 12, 30, 22))
    """
    for obs in collection:
        if observation_matches_key(obs, key):
            return obs
    return None


def find_observation_index(collection: List[Dict[str, str]], key: Tuple) -> int:
    """
    Find index of observation in collection by key.
    
    Args:
        collection: List of observations
        key: Key tuple (KK, O, JJ, MM, TT, g, ZS, ZM, EE)
    """
    for i, obs in enumerate(collection):
        if observation_matches_key(obs, key):
            return i
    return -1


def add_observation(obs: Dict[str, str], collection: List[Dict[str, str]], 
                   allow_duplicates: bool = False) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Add observation to collection.
    
    Args:
        obs: Observation to add
        collection: Existing collection
        allow_duplicates: If False, reject if key already exists
        
    Returns:
        Tuple of (success, updated_collection)
        
    Example:
        >>> success, observations = add_observation(new_obs, observations)
        >>> if not success:
        ...     print("Duplicate observation")
    """
    if not allow_duplicates:
        key = make_observation_key(obs)
        if find_observation(collection, key) is not None:
            return (False, collection)
    
    new_collection = collection.copy()
    new_collection.append(obs)
    return (True, new_collection)


def update_observation(key: Tuple, updated_obs: Dict[str, str], 
                      collection: List[Dict[str, str]]) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Update observation in collection.
    
    Args:
        key: Key of observation to update (KK, O, JJ, MM, TT, g, ZS, ZM, EE)
        updated_obs: New observation data
        collection: Existing collection
        
    Returns:
        Tuple of (success, updated_collection)
        
    Example:
        >>> key = (44, 1, 25, 1, 15, 22, 10)
        >>> success, observations = update_observation(key, modified_obs, observations)
    """
    idx = find_observation_index(collection, key)
    if idx == -1:
        return (False, collection)
    
    new_collection = collection.copy()
    new_collection[idx] = updated_obs
    return (True, new_collection)


def delete_observation(key: Tuple, collection: List[Dict[str, str]]) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Delete observation from collection.
    
    Args:
        key: Key of observation to delete (KK, O, JJ, MM, TT, g, ZS, ZM, EE)
        collection: Existing collection
        
    Returns:
        Tuple of (success, updated_collection)
        
    Example:
        >>> key = (44, 1, 25, 1, 15, 22, 10)
        >>> success, observations = delete_observation(key, observations)
    """
    idx = find_observation_index(collection, key)
    if idx == -1:
        return (False, collection)
    
    new_collection = collection.copy()
    del new_collection[idx]
    return (True, new_collection)


# ============================================================================
# Collection Operations
# ============================================================================

def sort_observations(collection: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Sort observations by HALO standard order: J → M → T → ZS → ZM → K → E → gg.
    
    This is the "spaeter()" function from the original Pascal code.
    
    Args:
        collection: Unsorted observations
        
    Returns:
        New sorted list (original unchanged)
        
    Example:
        >>> sorted_obs = sort_observations(observations)
    """
    def sort_key(obs: Dict[str, str]) -> Tuple:
        """Generate sort key matching HALO standard."""
        return (
            _int(obs, 'JJ'),      # Year (already 4-digit)
            _int(obs, 'MM'),      # Month
            _int(obs, 'TT'),      # Day
            _int(obs, 'ZS'),      # Sun hour
            _int(obs, 'ZM'),      # Sun minute
            _int(obs, 'KK'),      # Observer
            _int(obs, 'EE'),      # Halo type
            _int(obs, 'GG')       # Geographic region
        )
    
    return sorted(collection, key=sort_key)


def merge_observations(current: List[Dict[str, str]], new: List[Dict[str, str]],
                      skip_duplicates: bool = True) -> Tuple[int, List[Dict[str, str]]]:
    """
    Merge two observation collections.
    
    Args:
        current: Existing observations
        new: New observations to merge
        skip_duplicates: If True, skip observations with existing keys
        
    Returns:
        Tuple of (added_count, merged_collection)
        
    Example:
        >>> added, observations = merge_observations(current_obs, uploaded_obs)
        >>> print(f"Added {added} new observations")
    """
    merged = current.copy()
    added_count = 0
    
    for obs in new:
        key = make_observation_key(obs)
        if skip_duplicates and find_observation(merged, key) is not None:
            continue  # Skip duplicate
        merged.append(obs)
        added_count += 1
    
    return (added_count, merged)


def find_duplicates(collection: List[Dict[str, str]]) -> List[Tuple[int, int, Tuple]]:
    """
    Find duplicate observations in collection.
    
    Args:
        collection: Observations to check
        
    Returns:
        List of (index1, index2, key) tuples for each duplicate pair
        
    Example:
        >>> duplicates = find_duplicates(observations)
        >>> for idx1, idx2, key in duplicates:
        ...     print(f"Duplicate at {idx1} and {idx2}: {key}")
    """
    seen = {}
    duplicates = []
    
    for i, obs in enumerate(collection):
        key = make_observation_key(obs)
        if key in seen:
            duplicates.append((seen[key], i, key))
        else:
            seen[key] = i
    
    return duplicates


def remove_duplicates(collection: List[Dict[str, str]], 
                     keep: str = 'first') -> Tuple[int, List[Dict[str, str]]]:
    """
    Remove duplicate observations from collection.
    
    Args:
        collection: Observations with possible duplicates
        keep: 'first' or 'last' - which duplicate to keep
        
    Returns:
        Tuple of (removed_count, deduplicated_collection)
        
    Example:
        >>> removed, observations = remove_duplicates(observations, keep='first')
    """
    seen = set()
    unique = []
    removed_count = 0
    
    if keep == 'first':
        for obs in collection:
            key = make_observation_key(obs)
            if key not in seen:
                seen.add(key)
                unique.append(obs)
            else:
                removed_count += 1
    else:  # keep == 'last'
        for obs in reversed(collection):
            key = make_observation_key(obs)
            if key not in seen:
                seen.add(key)
                unique.insert(0, obs)
            else:
                removed_count += 1
    
    return (removed_count, unique)


# ============================================================================
# Filtering
# ============================================================================

def filter_observations(collection: List[Dict[str, str]], **criteria) -> List[Dict[str, str]]:
    """
    Filter observations by various criteria.
    
    Supported criteria (all optional):
        observer_kk: int or List[int] - Observer code(s)
        year: int or Tuple[int, int] - Single year or (min, max) range
        month: int or Tuple[int, int] - Single month or (min, max) range
        day: int or Tuple[int, int] - Single day or (min, max) range
        halo_type: int or List[int] - Halo type(s) (EE)
        geographic_region: int or List[int] - Region(s) (GG)
        observation_site: int or List[int] - Site(s) (O)
        custom_filter: Callable[[Dict[str, str]], bool] - Custom filter function
        
    Args:
        collection: Observations to filter
        **criteria: Filter criteria (see above)
        
    Returns:
        Filtered list (original unchanged)
        
    Examples:
        >>> # Filter by single observer
        >>> obs_44 = filter_observations(observations, observer_kk=44)
        
        >>> # Filter by year range
        >>> obs_90s = filter_observations(observations, year=(1990, 1999))
        
        >>> # Multiple criteria
        >>> filtered = filter_observations(observations, 
        ...     observer_kk=[44, 45], 
        ...     year=(2020, 2025),
        ...     halo_type=22)
    """
    filtered = collection
    
    # Observer filter
    if 'observer_kk' in criteria:
        kk = criteria['observer_kk']
        if isinstance(kk, (list, tuple)):
            filtered = [obs for obs in filtered if _int(obs, 'KK') in kk]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'KK') == kk]
    
    # Year filter
    if 'year' in criteria:
        year = criteria['year']
        if isinstance(year, tuple):
            min_year, max_year = year
            filtered = [obs for obs in filtered
                       if min_year <= _int(obs, 'JJ') <= max_year]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'JJ') == year]
    
    # Month filter
    if 'month' in criteria:
        month = criteria['month']
        if isinstance(month, tuple):
            min_month, max_month = month
            filtered = [obs for obs in filtered if min_month <= _int(obs, 'MM') <= max_month]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'MM') == month]
    
    # Day filter
    if 'day' in criteria:
        day = criteria['day']
        if isinstance(day, tuple):
            min_day, max_day = day
            filtered = [obs for obs in filtered if min_day <= _int(obs, 'TT') <= max_day]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'TT') == day]
    
    # Halo type filter
    if 'halo_type' in criteria:
        ee = criteria['halo_type']
        if isinstance(ee, (list, tuple)):
            filtered = [obs for obs in filtered if _int(obs, 'EE') in ee]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'EE') == ee]
    
    # Geographic region filter
    if 'geographic_region' in criteria:
        gg = criteria['geographic_region']
        if isinstance(gg, (list, tuple)):
            filtered = [obs for obs in filtered if _int(obs, 'GG') in gg]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'GG') == gg]
    
    # Observation site filter
    if 'observation_site' in criteria:
        o = criteria['observation_site']
        if isinstance(o, (list, tuple)):
            filtered = [obs for obs in filtered if _int(obs, 'O') in o]
        else:
            filtered = [obs for obs in filtered if _int(obs, 'O') == o]
    
    # Custom filter function
    if 'custom_filter' in criteria:
        custom_fn = criteria['custom_filter']
        filtered = [obs for obs in filtered if custom_fn(obs)]
    
    return filtered


def _get_full_year(jj: int) -> int:
    """Convert 2-digit year to 4-digit year."""
    return jj_to_full_year(jj)


# ============================================================================
# Statistics & Analysis
# ============================================================================

def count_observations(collection: List[Dict[str, str]], **criteria) -> int:
    """
    Count observations matching criteria.
    
    Args:
        collection: Observations to count
        **criteria: Same as filter_observations()
        
    Returns:
        Count of matching observations
        
    Example:
        >>> count = count_observations(observations, observer_kk=44, year=2025)
    """
    return len(filter_observations(collection, **criteria))


def get_date_range(collection: List[Dict[str, str]]) -> Optional[Tuple[Tuple[int, int, int], 
                                                                     Tuple[int, int, int]]]:
    """
    Get date range of observations.
    
    Args:
        collection: Observations
        
    Returns:
        Tuple of ((min_year, min_month, min_day), (max_year, max_month, max_day))
        or None if collection is empty
        
    Example:
        >>> date_range = get_date_range(observations)
        >>> if date_range:
        ...     (min_y, min_m, min_d), (max_y, max_m, max_d) = date_range
        ...     print(f"From {min_y}-{min_m}-{min_d} to {max_y}-{max_m}-{max_d}")
    """
    if not collection:
        return None
    
    dates = [(_get_full_year(_int(obs, 'JJ')), _int(obs, 'MM'), _int(obs, 'TT')) for obs in collection]
    return (min(dates), max(dates))


def get_observers(collection: List[Dict[str, str]]) -> List[int]:
    """
    Get list of unique observer codes in collection.
    
    Args:
        collection: Observations
        
    Returns:
        Sorted list of unique observer codes (KK)
        
    Example:
        >>> observers = get_observers(observations)
        >>> print(f"Observers: {', '.join(map(str, observers))}")
    """
    return sorted(set(_int(obs, 'KK') for obs in collection))


# ============================================================================
# Format Conversion
# ============================================================================

def needs_conversion(collection: List[Dict[str, str]]) -> bool:
    """
    Check if any observations need legacy format conversion.
    
    Legacy format indicators:
        - d == '255' (should be empty or 0-9)
        
    Args:
        collection: Observations to check
        
    Returns:
        True if conversion is needed
        
    Example:
        >>> if needs_conversion(observations):
        ...     observations = convert_all_legacy_format(observations)
    """
    for obs in collection:
        # Check for legacy d encoding (255 instead of proper values)
        if obs.get('d', '') == '255':
            return True
    return False


def convert_legacy_observation(obs: Dict[str, str]) -> Dict[str, str]:
    """
    Convert single observation from legacy to modern format.
    
    Conversions:
        - d: '255' → '0' (no cirrus observed)
        
    Args:
        obs: Legacy observation
        
    Returns:
        Converted observation (new dict)
        
    Example:
        >>> modern_obs = convert_legacy_observation(legacy_obs)
    """
    converted = obs.copy()
    
    # Convert d field: 255 → 0 (legacy encoding for "no cirrus")
    if converted.get('d', '') == '255':
        converted['d'] = '0'
    
    return converted


def convert_all_legacy_format(collection: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """
    Convert all observations from legacy to modern format.
    
    Args:
        collection: Observations (may contain legacy format)
        
    Returns:
        New collection with all observations converted
        
    Example:
        >>> observations = convert_all_legacy_format(observations)
    """
    return [convert_legacy_observation(obs) for obs in collection]


# ============================================================================
# Validation
# ============================================================================

def validate_observation(obs: Dict[str, str]) -> Tuple[bool, List[str]]:
    """
    Validate observation data against HALO_DATA_FORMAT specification.
    
    Checks:
        - Required fields present and in range
        - Optional field value ranges
        - Field dependencies (d/N/C, EE/HO/HU)
        
    Args:
        obs: Observation to validate
        
    Returns:
        Tuple of (is_valid, error_messages)
    """
    from halo.models.constants import VALID_HALO_TYPES, GEOGRAPHIC_REGIONS

    errors = []
    
    # --- Required fields ---
    kk = _int(obs, 'KK')
    o = _int(obs, 'O')
    mm = _int(obs, 'MM')
    tt = _int(obs, 'TT')
    ee = _int(obs, 'EE')
    gg = _int(obs, 'GG')
    g = _int(obs, 'g')
    
    if kk < 1 or kk > 99:
        errors.append(f"Invalid KK: {kk} (must be 1-99)")
    
    if o < 1 or o > 5:
        errors.append(f"Invalid O: {o} (must be 1-5)")
    
    if mm < 1 or mm > 12:
        errors.append(f"Invalid MM: {mm} (must be 1-12)")
    
    if tt < 1 or tt > 31:
        errors.append(f"Invalid TT: {tt} (must be 1-31)")
    
    if ee not in VALID_HALO_TYPES:
        errors.append(f"Invalid EE: {ee} (must be 1-77 or 99)")
    
    if gg not in GEOGRAPHIC_REGIONS:
        errors.append(f"Invalid GG: {gg} (must be a valid region code)")
    
    if g < 0 or g > 2:
        errors.append(f"Invalid g: {g} (must be 0-2)")
    
    # --- Optional fields (allow -1 = not specified) ---
    zs = _int(obs, 'ZS', -1)
    zm = _int(obs, 'ZM', -1)
    dd = _int(obs, 'DD', -1)
    d = _int(obs, 'd', -1)
    n = _int(obs, 'N', -1)
    c_val = _int(obs, 'C', -1)
    c_low = _int(obs, 'c', -1)
    h = _int(obs, 'H', -1)
    f = _int(obs, 'F', -1)
    v = _int(obs, 'V', -1)
    front = _int(obs, 'f', -1)
    zz = _int(obs, 'zz', -1)
    ho = _int(obs, 'HO', -1)
    hu = _int(obs, 'HU', -1)
    
    if zs != -1 and (zs < 0 or zs > 23):
        errors.append(f"Invalid ZS: {zs} (must be 0-23)")
    
    if zm != -1 and (zm < 0 or zm > 59):
        errors.append(f"Invalid ZM: {zm} (must be 0-59)")
    
    if dd != -1 and (dd < 0 or dd > 99):
        errors.append(f"Invalid DD: {dd} (must be 0-99)")
    
    if d != -1 and (d < 0 or d > 7 or d == 3):
        errors.append(f"Invalid d: {d} (must be 0-2, 4-7)")
    
    if n != -1 and (n < 0 or n > 9):
        errors.append(f"Invalid N: {n} (must be 0-9)")
    
    if c_val != -1 and (c_val < 0 or c_val > 7):
        errors.append(f"Invalid C: {c_val} (must be 0-7)")
    
    if c_low != -1 and (c_low < 0 or c_low > 9):
        errors.append(f"Invalid c: {c_low} (must be 0-9)")
    
    if h != -1 and (h < 0 or h > 3):
        errors.append(f"Invalid H: {h} (must be 0-3)")
    
    if f != -1 and (f < 0 or f > 5):
        errors.append(f"Invalid F: {f} (must be 0-5)")
    
    if v != -1 and v not in (1, 2):
        errors.append(f"Invalid V: {v} (must be 1-2)")
    
    if front != -1 and (front < 0 or front > 8):
        errors.append(f"Invalid f: {front} (must be 0-8)")
    
    if zz != -1 and (zz < 0 or zz > 99):
        errors.append(f"Invalid zz: {zz} (must be 0-99)")
    
    if ho != -1 and ho != 0 and (ho < 1 or ho > 90):
        errors.append(f"Invalid HO: {ho} (must be 0 or 1-90)")
    
    if hu != -1 and hu != 0 and (hu < 1 or hu > 90):
        errors.append(f"Invalid HU: {hu} (must be 0 or 1-90)")
    
    # Field dependencies are enforced client-side (observation-form.js constraints)
    
    return (len(errors) == 0, errors)


def validate_collection(collection: List[Dict[str, str]]) -> Dict[int, List[str]]:
    """
    Validate all observations in collection.
    
    Args:
        collection: Observations to validate
        
    Returns:
        Dictionary mapping index → list of error messages
        Only contains entries for invalid observations
        
    Example:
        >>> errors = validate_collection(observations)
        >>> if errors:
        ...     for idx, error_list in errors.items():
        ...         print(f"Observation {idx}: {', '.join(error_list)}")
    """
    validation_errors = {}
    
    for i, obs in enumerate(collection):
        is_valid, errors = validate_observation(obs)
        if not is_valid:
            validation_errors[i] = errors
    
    return validation_errors
