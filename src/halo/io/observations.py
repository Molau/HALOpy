"""
Observation data management layer (storage-agnostic)

This module provides business logic for observation collections WITHOUT knowing
about the underlying storage (file, database, etc.). All functions work with
in-memory List[Observation] collections.

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
from ..models.types import Observation
from halo.models.constants import jj_to_full_year


# ============================================================================
# Key Management
# ============================================================================

def make_observation_key(obs: Observation) -> Tuple[int, int, int, int, int, int, int]:
    """
    Create unique key tuple for observation.
    
    Key fields: (KK, O, JJ, MM, TT, EE, GG)
    
    Args:
        obs: Observation object
        
    Returns:
        Tuple of 7 integers representing the unique key
        
    Example:
        >>> key = make_observation_key(obs)
        >>> key
        (44, 1, 25, 1, 15, 22, 10)
    """
    return (obs.KK, obs.O, obs.JJ, obs.MM, obs.TT, obs.EE, obs.GG)


def observation_matches_key(obs: Observation, key: Tuple) -> bool:
    """
    Check if observation matches the given key.
    
    Args:
        obs: Observation to check
        key: Key tuple (KK, O, JJ, MM, TT, EE, GG)
        
    Returns:
        True if observation matches key
    """
    return make_observation_key(obs) == key


# ============================================================================
# Single Observation Operations
# ============================================================================

def find_observation(collection: List[Observation], key: Tuple) -> Optional[Observation]:
    """
    Find observation in collection by key.
    
    Args:
        collection: List of observations
        key: Key tuple (KK, O, JJ, MM, TT, EE, GG)
        
    Returns:
        Observation if found, None otherwise
        
    Example:
        >>> obs = find_observation(observations, (44, 1, 25, 1, 15, 22, 10))
    """
    for obs in collection:
        if observation_matches_key(obs, key):
            return obs
    return None


def find_observation_index(collection: List[Observation], key: Tuple) -> int:
    """
    Find index of observation in collection by key.
    
    Args:
        collection: List of observations
        key: Key tuple (KK, O, JJ, MM, TT, EE, GG)
        
    Returns:
        Index if found, -1 otherwise
    """
    for i, obs in enumerate(collection):
        if observation_matches_key(obs, key):
            return i
    return -1


def add_observation(obs: Observation, collection: List[Observation], 
                   allow_duplicates: bool = False) -> Tuple[bool, List[Observation]]:
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


def update_observation(key: Tuple, updated_obs: Observation, 
                      collection: List[Observation]) -> Tuple[bool, List[Observation]]:
    """
    Update observation in collection.
    
    Args:
        key: Key of observation to update (KK, O, JJ, MM, TT, EE, GG)
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


def delete_observation(key: Tuple, collection: List[Observation]) -> Tuple[bool, List[Observation]]:
    """
    Delete observation from collection.
    
    Args:
        key: Key of observation to delete (KK, O, JJ, MM, TT, EE, GG)
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

def sort_observations(collection: List[Observation]) -> List[Observation]:
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
    def sort_key(obs: Observation) -> Tuple:
        """Generate sort key matching HALO standard."""
        # Convert 2-digit year to 4-digit for proper sorting
        jj_full = jj_to_full_year(obs.JJ)
        
        return (
            jj_full,      # Year (4-digit)
            obs.MM,       # Month
            obs.TT,       # Day
            obs.ZS,       # Sun hour
            obs.ZM,       # Sun minute
            obs.KK,       # Observer
            obs.EE,       # Halo type
            obs.GG        # Geographic region
        )
    
    return sorted(collection, key=sort_key)


def merge_observations(current: List[Observation], new: List[Observation],
                      skip_duplicates: bool = True) -> Tuple[int, List[Observation]]:
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


def find_duplicates(collection: List[Observation]) -> List[Tuple[int, int, Tuple]]:
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


def remove_duplicates(collection: List[Observation], 
                     keep: str = 'first') -> Tuple[int, List[Observation]]:
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

def filter_observations(collection: List[Observation], **criteria) -> List[Observation]:
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
        custom_filter: Callable[[Observation], bool] - Custom filter function
        
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
        
        >>> # Custom filter
        >>> bright = filter_observations(observations,
        ...     custom_filter=lambda obs: obs.H >= 5)
    """
    filtered = collection
    
    # Observer filter
    if 'observer_kk' in criteria:
        kk = criteria['observer_kk']
        if isinstance(kk, (list, tuple)):
            filtered = [obs for obs in filtered if obs.KK in kk]
        else:
            filtered = [obs for obs in filtered if obs.KK == kk]
    
    # Year filter
    if 'year' in criteria:
        year = criteria['year']
        if isinstance(year, tuple):
            min_year, max_year = year
            filtered = [obs for obs in filtered
                       if min_year <= jj_to_full_year(obs.JJ) <= max_year]
        else:
            filtered = [obs for obs in filtered if jj_to_full_year(obs.JJ) == year]
    
    # Month filter
    if 'month' in criteria:
        month = criteria['month']
        if isinstance(month, tuple):
            min_month, max_month = month
            filtered = [obs for obs in filtered if min_month <= obs.MM <= max_month]
        else:
            filtered = [obs for obs in filtered if obs.MM == month]
    
    # Day filter
    if 'day' in criteria:
        day = criteria['day']
        if isinstance(day, tuple):
            min_day, max_day = day
            filtered = [obs for obs in filtered if min_day <= obs.TT <= max_day]
        else:
            filtered = [obs for obs in filtered if obs.TT == day]
    
    # Halo type filter
    if 'halo_type' in criteria:
        ee = criteria['halo_type']
        if isinstance(ee, (list, tuple)):
            filtered = [obs for obs in filtered if obs.EE in ee]
        else:
            filtered = [obs for obs in filtered if obs.EE == ee]
    
    # Geographic region filter
    if 'geographic_region' in criteria:
        gg = criteria['geographic_region']
        if isinstance(gg, (list, tuple)):
            filtered = [obs for obs in filtered if obs.GG in gg]
        else:
            filtered = [obs for obs in filtered if obs.GG == gg]
    
    # Observation site filter
    if 'observation_site' in criteria:
        o = criteria['observation_site']
        if isinstance(o, (list, tuple)):
            filtered = [obs for obs in filtered if obs.O in o]
        else:
            filtered = [obs for obs in filtered if obs.O == o]
    
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

def count_observations(collection: List[Observation], **criteria) -> int:
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


def get_date_range(collection: List[Observation]) -> Optional[Tuple[Tuple[int, int, int], 
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
    
    dates = [(_get_full_year(obs.JJ), obs.MM, obs.TT) for obs in collection]
    return (min(dates), max(dates))


def get_observers(collection: List[Observation]) -> List[int]:
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
    return sorted(set(obs.KK for obs in collection))


# ============================================================================
# Format Conversion
# ============================================================================

def needs_conversion(collection: List[Observation]) -> bool:
    """
    Check if any observations need legacy format conversion.
    
    Legacy format indicators:
        - vers != 25
        - d == 255 (should be -1 or 0-9)
        - Special encoding artifacts
        
    Args:
        collection: Observations to check
        
    Returns:
        True if conversion is needed
        
    Example:
        >>> if needs_conversion(observations):
        ...     observations = convert_all_legacy_format(observations)
    """
    for obs in collection:
        # Check for legacy version markers
        if obs.vers != 25:
            return True
        # Check for legacy d encoding (255 instead of proper values)
        if obs.d == 255:
            return True
    return False


def convert_legacy_observation(obs: Observation) -> Observation:
    """
    Convert single observation from legacy to modern format.
    
    Conversions:
        - d: 255 → 0 (no cirrus observed)
        - vers: set to 25
        - Special value normalization
        
    Args:
        obs: Legacy observation
        
    Returns:
        Converted observation (new object)
        
    Example:
        >>> modern_obs = convert_legacy_observation(legacy_obs)
    """
    converted = Observation()
    
    # Copy all fields
    converted.vers = 25  # Modern version
    converted.KK = obs.KK
    converted.O = obs.O
    converted.JJ = obs.JJ
    converted.MM = obs.MM
    converted.TT = obs.TT
    converted.g = obs.g
    converted.ZS = obs.ZS
    converted.ZM = obs.ZM
    
    # Convert d field: 255 → 0 (legacy encoding for "no cirrus")
    converted.d = 0 if obs.d == 255 else obs.d
    
    converted.DD = obs.DD
    converted.N = obs.N
    converted.C = obs.C
    converted.c = obs.c
    converted.EE = obs.EE
    converted.H = obs.H
    converted.F = obs.F
    converted.V = obs.V
    converted.f = obs.f
    converted.zz = obs.zz
    converted.GG = obs.GG
    converted.HO = obs.HO
    converted.HU = obs.HU
    converted.sectors = obs.sectors
    converted.remarks = obs.remarks
    converted.VName = obs.VName
    converted.NName = obs.NName
    
    return converted


def convert_all_legacy_format(collection: List[Observation]) -> List[Observation]:
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

def validate_observation(obs: Observation) -> Tuple[bool, List[str]]:
    """
    Validate observation data.
    
    Checks:
        - Required fields present
        - Value ranges
        - Field dependencies
        - Date validity
        
    Args:
        obs: Observation to validate
        
    Returns:
        Tuple of (is_valid, error_messages)
        
    Example:
        >>> is_valid, errors = validate_observation(obs)
        >>> if not is_valid:
        ...     for error in errors:
        ...         print(f"Error: {error}")
    """
    errors = []
    
    # Check required fields
    if obs.KK < 1 or obs.KK > 99:
        errors.append(f"Invalid observer code KK: {obs.KK} (must be 1-99)")
    
    if obs.O < 0 or obs.O > 9:
        errors.append(f"Invalid observation site O: {obs.O} (must be 0-9)")
    
    if obs.MM < 1 or obs.MM > 12:
        errors.append(f"Invalid month MM: {obs.MM} (must be 1-12)")
    
    if obs.TT < 1 or obs.TT > 31:
        errors.append(f"Invalid day TT: {obs.TT} (must be 1-31)")
    
    if obs.EE < 1 or obs.EE > 99:
        errors.append(f"Invalid halo type EE: {obs.EE} (must be 1-99)")
    
    if obs.GG < 1 or obs.GG > 39:
        errors.append(f"Invalid geographic region GG: {obs.GG} (must be 1-39)")
    
    # Value range checks for optional fields
    if obs.d != -1 and (obs.d < 0 or obs.d > 9):
        errors.append(f"Invalid cirrus density d: {obs.d} (must be -1 or 0-9)")
    
    if obs.H != -1 and (obs.H < 0 or obs.H > 9):
        errors.append(f"Invalid brightness H: {obs.H} (must be -1 or 0-9)")
    
    if obs.F != -1 and (obs.F < 0 or obs.F > 9):
        errors.append(f"Invalid colour F: {obs.F} (must be -1 or 0-9)")
    
    # Field dependencies (basic checks - full rules in HALO_DATA_FORMAT.md)
    if obs.d >= 4 and obs.N != 0:
        errors.append("Field dependency: d ≥ 4 requires N = 0")
    
    if obs.d >= 4 and obs.C != 0:
        errors.append("Field dependency: d ≥ 4 requires C = 0")
    
    return (len(errors) == 0, errors)


def validate_collection(collection: List[Observation]) -> Dict[int, List[str]]:
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
