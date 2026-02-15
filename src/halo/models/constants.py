"""
Constants and configuration values
Translated from H_TYPES.PAS
"""

# Standard library imports
import logging
import math
import sys

# API Configuration
DEFAULT_OBSERVATION_LIMIT = 200000  # Default maximum observations returned by API

# Year range and cutoff for 2-digit year conversion
# YEAR_MIN is also the cutoff boundary (e.g., 1980 → cutoff 80)
YEAR_MIN = 1980
YEAR_MAX = 2079
YEAR_CUTOFF = YEAR_MIN % 100


def jj_to_full_year(jj: int) -> int:
    """
    Convert 2-digit year to 4-digit year using YEAR_MIN cutoff.

    Args:
        jj: 2-digit year (0-99)

    Returns:
        4-digit year (e.g., 79 → 2079 if cutoff=80, 80 → 1980)
    """
    if (jj>=100):
        return jj  # Already a full year
    return (2000 + jj) if jj < YEAR_CUTOFF else (1900 + jj)

# Geographic regions (available region numbers in HALO system)
# Germany: 1-11, International: 16-17, 19-39
# Region 12 (Deutschland gesamt) is not used for observations
GEOGRAPHIC_REGIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]

# Circular halo types (complete rings around sun/moon)
# These halos need sector specification when incomplete (V=1)
CIRCULAR_HALOS = {1, 7, 12, 31, 32, 33, 34, 35, 36, 40}

# Light pillar height values (degrees above/below horizon)
# -1 = not observed, 0 = observed but not measured, 1-90 = measured height in degrees
# Used for HO (Obere Lichtsäule) and HU (Untere Lichtsäule) fields (EE=8,9,10)
PILLAR_HEIGHT_VALUES = ['-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                        '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 
                        '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
                        '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
                        '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
                        '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
                        '61', '62', '63', '64', '65', '66', '67', '68', '69', '70',
                        '71', '72', '73', '74', '75', '76', '77', '78', '79', '80',
                        '81', '82', '83', '84', '85', '86', '87', '88', '89', '90']

# All possible pillar height values including 0 (observed but not measured)
ALL_PILLAR_HEIGHT_VALUES = ['0', '-1', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                            '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 
                            '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
                            '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
                            '41', '42', '43', '44', '45', '46', '47', '48', '49', '50',
                            '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
                            '61', '62', '63', '64', '65', '66', '67', '68', '69', '70',
                            '71', '72', '73', '74', '75', '76', '77', '78', '79', '80',
                            '81', '82', '83', '84', '85', '86', '87', '88', '89', '90']

# Mapping of combined halo types to their individual components
# Combined type splits into (left, right) for statistics
# Pattern: EE N splits into (N-2, N-1)
# Example: EE 04 (both 22° parhelia) → EE 02 (left) + EE 03 (right)
COMBINED_TO_INDIVIDUAL_HALOS = {
    4: (2, 3),      # Both 22° parhelia → left + right
    10: (8, 9),     # Both 22° paranthelion → left + right
    16: (14, 15),   # Both 46° parhelia → left + right
    20: (18, 19),   # Both 46° paranthelion → left + right
    26: (24, 25),   # Both 120° parhelia → left + right
    43: (41, 42),   # Both Lowitz arcs → left + right
    47: (45, 46),   # Both diffuse arcs → left + right
    50: (48, 49),   # Both supralateral arcs → left + right
    55: (53, 54),   # Both infralateral arcs → left + right
    76: (74, 75),   # Both subparhelia → left + right
}

# Days per month [regular, leap year]
DAYS_PER_MONTH = [
    (31, 31), (28, 29), (31, 31), (30, 30), (31, 31), (30, 30),
    (31, 31), (31, 31), (30, 30), (31, 31), (30, 30), (31, 31)
]

# Halo type weighting factors (for statistical calculations)
# Index 0 is unused, indices 1-99 correspond to halo types 1-99
HALO_TYPE_FACTORS = [
    0,  # Index 0 (unused)
    1, 2, 2, 4, 3, 3, 3, 5, 20, 25,  # 1-10
    8, 20, 20, 50, 50, 100, 75, 50, 50, 100,  # 11-20
    20, 75, 75, 100, 100, 100, 50, 100, 100, 100,  # 21-30
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100,  # 31-40
    100, 100, 100, 0, 0, 0, 0, 100, 100, 100,  # 41-50
    50, 100, 100, 100, 100, 100, 100, 100, 100, 100,  # 51-60
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100,  # 61-70
    100, 100, 100, 100, 100, 100, 100, 0, 0, 0,  # 71-80
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  # 81-90
    0, 0, 0, 0, 0, 0, 0, 0, 0  # 91-99
]

# Halo brightness weighting factors (Halohellfaktor from H_TYPES.PAS)
# -1: very faint, 0: faint, 1: medium, 2: bright, 3: very bright
HALO_BRIGHTNESS_FACTORS = {
    -1: 1.0,
    0: 0.8,
    1: 1.0,
    2: 1.2,
    3: 1.4
}

def calculate_halo_activity(observations, observers, mm, jj, active_observers_only=True):
    """
    Calculate halo activity for a month (reusable function).
    
    Activity is calculated per day based on:
    - Rarity of halo type (Haloartfaktor)
    - Brightness (Halohellfaktor) 
    - Duration (D field)
    - Completeness (D field)
    
    Only solar halos (O=1) in Germany and neighbors with good weather (dd >= -1, dd <= 2)
    are considered. Activity is normalized by number of active observers.
    
    Args:
        observations: List of observation records
        observers: Dict of observer data {KK: observer_info}
        mm: Month (1-12)
        jj: Year (2-digit)
        active_observers_only: Only count active observers
    
    Returns:
        Dict with 'real' and 'relative' activity per day (1-31) and 'active_count'
    """
    logger = logging.getLogger(__name__)
    
    # Initialize activity arrays
    real_activity = {day: 0.0 for day in range(1, 32)}
    relative_activity = {day: 0.0 for day in range(1, 32)}
    active_observers = set()
    
    # Process each observation
    filtered_count = 0
    observer_found_count = 0
    observer_not_found_count = 0
    
    for obs in observations:
        # Filter criteria from Pascal code (lines 823-826)
        if obs.MM != mm or obs.JJ != jj:
            continue
        if obs.O != 1:  # Only solar halos
            continue
        if obs.GG not in {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 21, 26, 27, 29, 32}:  # Germany + neighbors
            continue
        if obs.d < -1 or obs.d > 2:  # Cirrus condition (d = cirrus density)
            continue
        if obs.g == 1:  # Exclude "other location"
            continue
        
        filtered_count += 1
        
        # Check if observer exists in observer data
        kk = str(obs.KK).zfill(2)
        
        # Track active observers for this month
        active_observers.add(kk)
        
        # Log first few KK values to see format
        if filtered_count <= 3:
            logger.info(f"Processing obs: KK={kk} (from obs.KK={obs.KK}), checking if in observers dict...")
        
        # Calculate weight factor (lines 828-834)
        factor = HALO_TYPE_FACTORS[obs.EE] * HALO_BRIGHTNESS_FACTORS.get(obs.H, 1.0)
        
        # Duration/completeness adjustment
        if obs.DD > 0:
            factor = factor * obs.DD / 6.0
        elif obs.DD == 0:
            factor = factor / 12.0
        else:  # DD < 0
            factor = factor / 6.0
        
        # Add to real activity
        real_activity[obs.TT] += factor
        
        # Calculate relative activity with daylight factor
        # Determine latitude from observer data
        # observers is dict {kk: observer_record} where record is CSV row (list) or DB dict
        if kk in observers:
            observer_found_count += 1
            observer_record = observers[kk]
            
            # Helper function to access observer record fields (supports both dict and list format)
            def get_observer_field(obs_rec, key, index):
                """Get field from observer record (dict from DB or list from file)."""
                if isinstance(obs_rec, dict):
                    return obs_rec.get(key, '')
                else:
                    return obs_rec[index] if len(obs_rec) > index else ''
            
            # CORRECTED COLUMN INDICES FOR LATITUDE
            # Format: KK, VName, NName, seit, active, Ort, lonDeg, lonMin, lonSec, lonDir, latDeg, latMin, latDir, ...
            # Columns: 0    1     2      3    4      5    6       7       8       9       10      11      12    ...
            # Ort2, lonDeg, lonMin, lonSec, lonDir, latDeg, latMin, latDir
            # 13   14      15      16      17      18      19      20
            # Primary site (g=0): columns 10, 11, 12 = lat_deg, lat_min, lat_dir
            # Secondary site (g=2): columns 18, 19, 20 = lat_deg, lat_min, lat_dir
            if obs.g == 0:  # Primary site
                lat_deg_str = get_observer_field(observer_record, 'primary_lat_deg', 10)
                lat_min_str = get_observer_field(observer_record, 'primary_lat_min', 11)
                lat_ns = get_observer_field(observer_record, 'primary_lat_dir', 12)
                lat_deg = int(lat_deg_str) if lat_deg_str and lat_deg_str != '' else 50
                lat_min = int(lat_min_str) if lat_min_str and lat_min_str != '' else 0
                lat_ns = lat_ns if lat_ns else 'N'
            else:  # Secondary site (g=2)
                lat_deg_str = get_observer_field(observer_record, 'secondary_lat_deg', 18)
                lat_min_str = get_observer_field(observer_record, 'secondary_lat_min', 19)
                lat_ns = get_observer_field(observer_record, 'secondary_lat_dir', 20)
                lat_deg = int(lat_deg_str) if lat_deg_str and lat_deg_str != '' else 50
                lat_min = int(lat_min_str) if lat_min_str and lat_min_str != '' else 0
                lat_ns = lat_ns if lat_ns else 'N'
            
            latitude = lat_deg + lat_min / 60.0
            if lat_ns == 'S':
                latitude = -latitude
            
            # Daylight factor (matches Pascal SFaktor function)
            daylight_factor = calculate_daylight_factor(obs.TT, mm, latitude)
            
            relative_activity[obs.TT] += factor * daylight_factor
        else:
            # No observer data, use real activity
            observer_not_found_count += 1
            relative_activity[obs.TT] += factor
    
    # Normalize by number of active observers
    active_count = len(active_observers)
    
    logger.info(f"\n=== Activity calculation summary ===")
    logger.info(f"Observations matching filters: {filtered_count}")
    logger.info(f"Observer data FOUND: {observer_found_count}")
    logger.info(f"Observer data NOT FOUND: {observer_not_found_count}")
    logger.info(f"Active observers this month: {active_count}")
    
    if active_count > 0:
        for day in range(1, 32):
            real_activity[day] /= active_count
            relative_activity[day] /= active_count
    
    # Calculate monthly totals
    total_real = sum(real_activity.values())
    total_relative = sum(relative_activity.values())
    
    ratio = total_relative / total_real if total_real > 0 else 0.0
    
    logger.info(f"Total real activity: {total_real:.2f}")
    logger.info(f"Total relative activity: {total_relative:.2f}")
    logger.info(f"Relative/Real ratio: {ratio:.3f}")
    logger.info(f"=== End activity calculation ===\n")
    
    return {
        'real': real_activity,
        'relative': relative_activity,
        'total_real': total_real,
        'total_relative': total_relative,
        'active_count': active_count,
        'observation_count': filtered_count
    }

def calculate_daylight_factor(day, month, latitude):
    """
    Calculate daylight correction factor for relative halo activity.
    Matches Pascal SFaktor function from H_ROUT.PAS.
    
    Longer days = more observation time = factor > 1
    Shorter days = less observation time = factor < 1
    
    Args:
        day: Day of month (1-31) - ta parameter in Pascal
        month: Month (1-12) - mo parameter in Pascal
        latitude: Observer latitude in degrees - breite parameter in Pascal
    
    Returns:
        Daylight correction factor (Pascal: Pi/2 / ArcCos(-Tan(delta)*Tan(phi)))
    """
    # Pascal: dd:=-81; FOR lauf:=1 TO mo-1 DO dd:=dd+Tage[lauf];
    # Calculate day offset from start of year (starting at -81 for seasonal alignment)
    dd = -81
    for i in range(month - 1):
        dd += DAYS_PER_MONTH[i][0]  # Use non-leap year days
    
    # Pascal: delta:=0.41*Sin((dd+ta)*Pi/182.6);
    # Solar declination (0.41 ≈ sin(23.45°), 182.6 = 365.2/2)
    delta = 0.41 * math.sin((dd + day) * math.pi / 182.6)
    
    # Pascal: phi:=breite*Pi/180;
    phi = latitude * math.pi / 180.0
    
    # Pascal: SFaktor:=Pi/2/ArcCos(-Tan(delta)*Tan(phi));
    # Daylight factor based on solar declination and latitude
    try:
        tan_delta = math.tan(delta)
        tan_phi = math.tan(phi)
        cos_arg = -tan_delta * tan_phi
        
        # Clamp to valid range for acos
        cos_arg_clamped = max(-1.0, min(1.0, cos_arg))
        
        factor = (math.pi / 2.0) / math.acos(cos_arg_clamped)
        return factor
    except Exception:
        # Fallback if calculation fails (e.g., polar night/day)
        return 1.0


# Version flag for file format
FILE_FORMAT_VERSION = 25  # v2.5

def resolve_halo_type(ee: int) -> list[int]:
    """
    Resolve a halo type to its individual components for statistics.
    
    Combined halo types (ZusHaloart) are split into their individual parts (TeilHaloart).
    For example, EE 04 (both 22° parhelia) is resolved to [2, 3] (left + right).
    
    Individual halo types are returned as-is in a single-element list.
    
    Args:
        ee: Halo type code (1-99)
    
    Returns:
        List of individual halo type codes
        - For combined types: returns 2 elements (left, right)
        - For individual types: returns 1 element (the type itself)
    
    Examples:
        resolve_halo_type(4)   # Returns [2, 3]  (both 22° parhelia)
        resolve_halo_type(2)   # Returns [2]     (left 22° parhelion)
        resolve_halo_type(10)  # Returns [8, 9]  (both 22° paranthelion)
        resolve_halo_type(7)   # Returns [7]     (22° halo - not split)
    """
    if ee in COMBINED_TO_INDIVIDUAL_HALOS:
        # Combined type: return both components
        left, right = COMBINED_TO_INDIVIDUAL_HALOS[ee]
        return [left, right]
    else:
        # Individual type: return as-is
        return [ee]