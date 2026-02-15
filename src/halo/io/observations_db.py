"""
Database Operations for Observations (Layer 3b)

PostgreSQL-based storage implementation for observations.
Implements same interface as observations_file.py but uses SQL.

Author: HALOpy Team
Date: 2026-02-09
"""

# Optional import - only needed for cloud mode
try:
    import psycopg2  # type: ignore[import-untyped]
except ImportError:
    psycopg2 = None  # type: ignore

from typing import List, Optional, Tuple
from halo.models.types import Observation
from halo.models.constants import YEAR_CUTOFF
from halo.io.db_connection import get_connection


# ========================================
# Constants
# ========================================

# Timezone offsets by geographic region (from H_TYPES.PAS)
# Index 0 = Region 1, Index 1 = Region 2, etc.
# Values: hour offset to add to CET to get local time
ZEITZONE = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    2, 10, 0, 0, 1, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0,
    1, -1, 0, -8, 9
]


# ========================================
# Helper Functions: Python ↔ PostgreSQL Mapping
# ========================================

def _observation_to_tuple(obs: Observation) -> Tuple:
    """
    Convert Observation object to tuple for SQL INSERT/UPDATE.
    
    No mapping needed - DB column names match Python field names exactly.
    HO/HU fields → pillar column ("8HHHH" format)
    
    Args:
        obs: Observation object
        
    Returns:
        Tuple of 23 values matching PostgreSQL column order:
        KK, O, JJ, MM, TT, g, ZS, ZM, d, DD, N, C, c, EE, H, F, V, f, zz, GG, pillar, sectors, remarks
    """
    # Format pillar field: "8HHHH" where HH=HO, HH=HU
    pillar = f"8{obs.HO:02d}{obs.HU:02d}" if obs.HO > 0 or obs.HU > 0 else ""
    
    return (
        obs.KK, obs.O, obs.JJ, obs.MM, obs.TT, obs.g,
        obs.ZS, obs.ZM, obs.d, obs.DD, obs.N, obs.C, obs.c,
        obs.EE, obs.H, obs.F, obs.V, obs.f, obs.zz, obs.GG,
        pillar, obs.sectors, obs.remarks
    )


def _tuple_to_observation(row: Tuple) -> Observation:
    """
    Convert PostgreSQL row to Observation object.
    
    No mapping needed - DB column names match Python field names exactly.
    PostgreSQL NULL → Python -1 (not observed)
    pillar column → HO/HU fields (parse "8HHHH")
    
    Args:
        row: Database row tuple (23 values)
        
    Returns:
        Observation object
    """
    # Helper to convert NULL to -1 for OPTIONAL fields
    # NOT NULL fields: KK, O, JJ, MM, TT, g, EE, GG (always have values)
    # Optional fields with DEFAULT -1: ZS, ZM, d, DD, N, C, c, H, F, V, f, zz
    def null_to_minus1(value):
        return value if value is not None else -1
    
    # Parse pillar field: "8HHHH" → HO, HU
    # Special values: "//" or NULL = not observed (stored as -1 in Python)
    pillar = row[20] or ""
    if not pillar or pillar == "//":
        HO = -1
        HU = -1
    elif len(pillar) >= 3 and pillar[1:3].isdigit():
        HO = int(pillar[1:3])
        HU = int(pillar[3:5]) if len(pillar) >= 5 and pillar[3:5].isdigit() else 0
    else:
        HO = -1
        HU = -1
    
    # SQL SELECT order: KK, O, JJ, MM, TT, g, ZS, ZM, d, DD, N, C, c, EE, H, F, V, f, zz, GG, pillar, sectors, remarks
    # Index mapping:    0   1  2   3   4   5  6   7   8  9   10  11 12 13  14 15 16 17 18  19  20      21       22
    # DB columns now match Python fields exactly (with quotes in SQL)
    
    return Observation(
        # NOT NULL fields - use directly (never NULL in database)
        KK=row[0], 
        O=row[1], 
        JJ=row[2], 
        MM=row[3], 
        TT=row[4], 
        g=row[5],
        EE=row[13],
        GG=row[19],
        
        # Optional fields - convert NULL to -1
        ZS=null_to_minus1(row[6]), 
        ZM=null_to_minus1(row[7]), 
        d=null_to_minus1(row[8]), 
        DD=null_to_minus1(row[9]), 
        N=null_to_minus1(row[10]), 
        C=null_to_minus1(row[11]),
        c=null_to_minus1(row[12]),
        H=null_to_minus1(row[14]), 
        F=null_to_minus1(row[15]),
        V=null_to_minus1(row[16]), 
        f=null_to_minus1(row[17]),
        zz=null_to_minus1(row[18]), 
        
        # Pillar and text fields
        HO=HO, HU=HU, 
        sectors=row[21] or "", 
        remarks=row[22] or ""
    )


# ========================================
# READ Operations
# ========================================

def load_all() -> List[Observation]:
    """
    Load all observations from database, sorted by HALO standard.
    
    Sort order: jj → mm → tt → zs → zm → kk → ee → gg
    
    Returns:
        List of Observation objects, sorted
        
    Example:
        >>> observations = load_all()
        >>> print(f"Loaded {len(observations)} observations")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT "KK", "O", "JJ", "MM", "TT", "g",
                       "ZS", "ZM", "d", "DD", "N", "C", "c",
                       "EE", "H", "F", "V", "f", "zz", "GG",
                       pillar, sectors, remarks
                FROM observations
                ORDER BY 
                    CASE WHEN "JJ" >= {YEAR_CUTOFF} THEN "JJ" + 1900 ELSE "JJ" + 2000 END,
                    "MM", "TT", "ZS", "ZM", "KK", "EE", "GG"
            """)
            
            rows = cursor.fetchall()
            observations = [_tuple_to_observation(row) for row in rows]
            
            return observations


def load_filtered(**filters) -> List[Observation]:
    """
    Load observations with filters (any HALO Key field).
    
    Supported filters:
    - kk, o, jj, mm, tt, g, zs, zm, ee, gg: Single value or tuple (min, max)
    - d, dd, n, c, cc, h, f, v, ff, zz: Single value or tuple (min, max)
    
    Args:
        **filters: Field name → value or (min, max) tuple
        
    Returns:
        List of Observation objects matching filters, sorted
        
    Examples:
        >>> # Observer 44, year 2025
        >>> obs = load_filtered(kk=44, jj=25)
        
        >>> # Year range 2020-2025
        >>> obs = load_filtered(jj=(20, 25))
        
        >>> # Observer 44, December
        >>> obs = load_filtered(kk=44, mm=12)
    """
    if not filters:
        return load_all()
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Build WHERE clause dynamically
            where_clauses = []
            params = []
            
            for field, value in filters.items():
                # Normalize field name to match DB schema
                # HALO key fields are uppercase in DB (except lowercase: g, d, c, f, zz)
                # Non-HALO fields (pillar, sectors, remarks) stay lowercase
                if field in ['pillar', 'sectors', 'remarks']:
                    db_field = field  # No quotes for these
                elif field in ['g', 'd', 'c', 'f', 'zz']:
                    db_field = f'"{field}"'  # Keep lowercase with quotes
                else:
                    # All other HALO fields: uppercase with quotes
                    db_field = f'"{field.upper()}"'
                
                if isinstance(value, tuple) and len(value) == 2:
                    # Range filter: (min, max)
                    where_clauses.append(f"{db_field} BETWEEN %s AND %s")
                    params.extend(value)
                else:
                    # Exact match
                    where_clauses.append(f"{db_field} = %s")
                    params.append(value)
            
            where_sql = " AND ".join(where_clauses)
            
            query = f"""
                SELECT "KK", "O", "JJ", "MM", "TT", "g",
                       "ZS", "ZM", "d", "DD", "N", "C", "c",
                       "EE", "H", "F", "V", "f", "zz", "GG",
                       pillar, sectors, remarks
                FROM observations
                WHERE {where_sql}
                ORDER BY 
                    CASE WHEN "JJ" >= {YEAR_CUTOFF} THEN "JJ" + 1900 ELSE "JJ" + 2000 END,
                    "MM", "TT", "ZS", "ZM", "KK", "EE", "GG"
            """
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            observations = [_tuple_to_observation(row) for row in rows]
            
            return observations


def count() -> int:
    """
    Count total number of observations in database.
    
    Returns:
        Total observation count
        
    Example:
        >>> total = count()
        >>> print(f"Database contains {total} observations")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM observations")
            result = cursor.fetchone()
            return result[0] if result else 0


# ========================================
# WRITE Operations
# ========================================

def save_one(obs: Observation) -> bool:
    """
    Insert new observation (fails on duplicate key).
    
    Args:
        obs: Observation to insert
        
    Returns:
        True if inserted successfully
        False if duplicate key (kk, o, jj, mm, tt, g, zs, zm, ee, gg)
        
    Example:
        >>> obs = Observation(KK=44, O=1, JJ=25, MM=12, TT=31, ...)
        >>> if save_one(obs):
        ...     print("Observation saved")
        ... else:
        ...     print("Duplicate observation")
    """
    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                values = _observation_to_tuple(obs)
                
                cursor.execute("""
                    INSERT INTO observations (
                        "KK", "O", "JJ", "MM", "TT", "g",
                        "ZS", "ZM", "d", "DD", "N", "C", "c",
                        "EE", "H", "F", "V", "f", "zz", "GG",
                        pillar, sectors, remarks
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s
                    )
                """, values)
                
                conn.commit()
                return True
                
        except psycopg2.IntegrityError:
            # Duplicate key
            conn.rollback()
            return False


def update_one(key: Tuple, obs: Observation) -> bool:
    """
    Update existing observation (proper SQL UPDATE).
    
    Args:
        key: 7-tuple (KK, O, JJ, MM, TT, EE, GG)
        obs: Updated observation
        
    Returns:
        True if updated (1 row affected)
        False if not found (0 rows affected)
        
    Example:
        >>> key = (44, 1, 25, 12, 31, 22, 26)
        >>> obs = Observation(KK=44, O=1, JJ=25, MM=12, TT=31, EE=22, GG=26, ...)
        >>> if update_one(key, obs):
        ...     print("Observation updated")
        ... else:
        ...     print("Observation not found")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            values = _observation_to_tuple(obs)
            KK, O, JJ, MM, TT, EE, GG = key
            
            cursor.execute("""
                UPDATE observations SET
                    "KK"=%s, "O"=%s, "JJ"=%s, "MM"=%s, "TT"=%s, "g"=%s,
                    "ZS"=%s, "ZM"=%s, "d"=%s, "DD"=%s, "N"=%s, "C"=%s, "c"=%s,
                    "EE"=%s, "H"=%s, "F"=%s, "V"=%s, "f"=%s, "zz"=%s, "GG"=%s,
                    pillar=%s, sectors=%s, remarks=%s
                WHERE "KK"=%s AND "O"=%s AND "JJ"=%s AND "MM"=%s AND "TT"=%s AND "EE"=%s AND "GG"=%s
            """, values + (KK, O, JJ, MM, TT, EE, GG))
            
            affected_rows = cursor.rowcount
            conn.commit()
            return affected_rows > 0


def delete_one(key: Tuple) -> bool:
    """
    Delete observation by key.
    
    Args:
        key: 7-tuple (KK, O, JJ, MM, TT, EE, GG)
        
    Returns:
        True if deleted (1 row affected)
        False if not found (0 rows affected)
        
    Example:
        >>> key = (44, 1, 25, 12, 31, 22, 26)
        >>> if delete_one(key):
        ...     print("Observation deleted")
        ... else:
        ...     print("Observation not found")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            KK, O, JJ, MM, TT, EE, GG = key
            
            cursor.execute("""
                DELETE FROM observations
                WHERE "KK"=%s AND "O"=%s AND "JJ"=%s AND "MM"=%s AND "TT"=%s AND "EE"=%s AND "GG"=%s
            """, (KK, O, JJ, MM, TT, EE, GG))
            
            affected_rows = cursor.rowcount
            conn.commit()
            return affected_rows > 0


def delete_all_for_observer(kk: str) -> int:
    """
    Delete all observations for a specific observer (used for upload replace mode).
    
    Args:
        kk: Observer code (2-digit string, e.g., "44")
        
    Returns:
        Number of rows deleted
        
    Example:
        >>> count = delete_all_for_observer("44")
        >>> print(f"Deleted {count} observations for observer 44")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM observations WHERE \"KK\"=%s", (kk,))
            affected_rows = cursor.rowcount
            conn.commit()
            return affected_rows


def save_many(observations: List[Observation]) -> int:
    """
    Bulk insert observations with transaction (skips duplicates).
    
    Args:
        observations: List of observations to insert
        
    Returns:
        Number of observations successfully inserted (excludes duplicates)
        
    Example:
        >>> observations = [obs1, obs2, obs3, ...]
        >>> count = save_many(observations)
        >>> print(f"Inserted {count}/{len(observations)} observations")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            inserted_count = 0
            
            for obs in observations:
                try:
                    values = _observation_to_tuple(obs)
                    
                    cursor.execute("""
                        INSERT INTO observations (
                            "KK", "O", "JJ", "MM", "TT", "g",
                            "ZS", "ZM", "d", "DD", "N", "C", "c",
                            "EE", "H", "F", "V", "f", "zz", "GG",
                            pillar, sectors, remarks
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s
                        )
                    """, values)
                    
                    inserted_count += 1
                    
                except psycopg2.IntegrityError:
                    # Skip duplicate
                    conn.rollback()
                    continue
            
            conn.commit()
            return inserted_count


# ========================================
# ANALYSIS Operations
# ========================================

def _get_timezone_offset(region_code: int) -> int:
    """
    Calculate timezone offset (in hours) for a geographic region.
    
    Uses the exact Zeitzone array from H_TYPES.PAS (via analysis.js).
    
    Args:
        region_code: Geographic region code (GG field, 1-39)
    
    Returns:
        Hour offset to add to CET to get local time
    """
    # Validate region code and return corresponding offset
    if 1 <= region_code <= 38:
        return ZEITZONE[region_code - 1]  # Array is 0-indexed, regions are 1-indexed
    else:
        return 0  # Default to CET for invalid/missing region codes


def build_analysis_sql(params: dict) -> Tuple[str, List]:
    """
    Build SQL WHERE clause for analysis filters.
    
    Converts param1/param2 ranges and filter1/filter2 to SQL WHERE conditions.
    Handles all HALO parameters including special cases:
    - TT: Requires month/year context
    - ZZ: Timezone conversion based on GG
    - SH: Uses calculate_solar_altitude() function
    - EE/C: Split logic for suffixes (* and +)
    - SE: Sector filtering
    - HO_HU: Pillar height (8HHHH field)
    
    Args:
        params: Analysis parameters from API request
        
    Returns:
        Tuple of (where_clause, sql_params)
        where_clause: SQL WHERE conditions (without "WHERE" keyword)
        sql_params: List of parameter values for psycopg2
        
    Example:
        >>> params = {'param1': 'MM', 'param1_from': 1, 'param1_to': 12,
        ...           'filter1': 'KK', 'filter1_value': 44}
        >>> where_sql, sql_params = build_analysis_sql(params)
        >>> # where_sql = "mm BETWEEN %s AND %s AND kk = %s"
        >>> # sql_params = [1, 12, 44]
    """
    from halo.models.constants import YEAR_CUTOFF
    
    conditions = []
    sql_params = []
    
    # Helper to process a single filter (filter1 or filter2)
    def add_filter(prefix: str):
        param_name = params.get(f'{prefix}')
        if not param_name:
            return
        
        param_value = params.get(f'{prefix}_value')
        if param_value is None or param_value == '':
            return
        
        # Special handling for TT (day) - requires month/year
        if param_name == 'TT':
            month = params.get(f'{prefix}_month')
            year = params.get(f'{prefix}_year')
            if month is None or year is None:
                return
            
            try:
                day = int(param_value)
                month = int(month)
                year = int(year)
                # Convert 4-digit year to 2-digit if needed
                if year >= 1900:
                    year = year % 100
                
                conditions.append('"TT" = %s AND "MM" = %s AND "JJ" = %s')
                sql_params.extend([day, month, year])
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for ZZ (time) - uses ZS field with timezone conversion
        if param_name == 'ZZ':
            use_local = params.get(f'{prefix}_timezone') == 'local'
            try:
                time_val = float(param_value)
                if use_local:
                    # Convert from local time to CET: CET = (local - offset) % 24
                    # For filtering, we need to handle timezone conversion in SQL
                    # This is complex - for now, assume CET (no conversion)
                    conditions.append('"ZS" = %s')
                    sql_params.append(int(time_val))
                else:
                    conditions.append('"ZS" = %s')
                    sql_params.append(int(time_val))
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for SH (solar altitude) - calculated field
        if param_name == 'SH':
            # Cannot filter by exact value for calculated field
            # This is handled in param range filter instead
            return
        
        # Special handling for SE (sectors) - string matching
        if param_name == 'SE':
            # Check if octant letter is present in sectors string
            # Use LIKE with lowercase for case-insensitive matching
            conditions.append("LOWER(sectors) LIKE %s")
            sql_params.append(f'%{param_value.lower()}%')
            return
        
        # Special handling for EE (halo type) with split option
        if param_name == 'EE':
            split = params.get(f'{prefix}_ee_split', False)
            try:
                ee_val = int(param_value)
                if split:
                    # Exact match
                    conditions.append('"EE" = %s')
                    sql_params.append(ee_val)
                else:
                    # Match without suffix (*)
                    # EE field is SMALLINT, so no suffixes in DB - just exact match
                    conditions.append('"EE" = %s')
                    sql_params.append(ee_val)
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for C (completeness) with split option
        if param_name == 'C':
            split = params.get(f'{prefix}_c_split', False)
            try:
                c_val = int(param_value)
                if split:
                    # Exact match
                    conditions.append('"C" = %s')
                    sql_params.append(c_val)
                else:
                    # Match without suffix (+)
                    # C field is SMALLINT, no suffixes in DB - just exact match
                    conditions.append('"C" = %s')
                    sql_params.append(c_val)
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for DD (duration) with incomplete option
        if param_name == 'DD':
            incomplete = params.get(f'{prefix}_dd_incomplete', False)
            try:
                dd_val = int(param_value)
                if incomplete:
                    # Include all DD values (no filter)
                    pass
                else:
                    # Only observations with valid DD (not NULL)
                    conditions.append('"DD" = %s AND "DD" IS NOT NULL')
                    sql_params.append(dd_val)
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for HO_HU (pillar) - checks 8HHHH field
        if param_name == 'HO_HU':
            try:
                height = int(param_value)
                # Parse pillar field "8HHHH" where HH=HO, HH=HU
                # Match if either HO or HU equals the requested height
                conditions.append("(SUBSTRING(pillar, 2, 2) = %s OR SUBSTRING(pillar, 4, 2) = %s)")
                height_str = f"{height:02d}"
                sql_params.extend([height_str, height_str])
            except (ValueError, TypeError):
                pass
            return
        
        # Simple numeric parameters
        try:
            if param_name == 'JJ':
                # Year - convert 4-digit to 2-digit
                val = int(param_value)
                if val >= 1900:
                    val = val % 100
                conditions.append('"JJ" = %s')
                sql_params.append(val)
            else:
                # Use quoted identifiers for HALO key fields
                db_field = f'"{param_name}"'
                val = int(param_value)
                conditions.append(f"{db_field} = %s")
                sql_params.append(val)
        except (ValueError, TypeError):
            pass
    
    # Helper to process param range filter (param1 or param2)
    def add_param_range(prefix: str):
        param_name = params.get(prefix)
        if not param_name:
            return
        
        from_val = params.get(f'{prefix}_from')
        to_val = params.get(f'{prefix}_to')
        
        # Special handling for TT (day) - ALWAYS requires month/year
        if param_name == 'TT':
            month = params.get(f'{prefix}_month')
            year = params.get(f'{prefix}_year')
            if month is None or year is None:
                return
            
            try:
                month = int(month)
                year = int(year)
                # Convert 4-digit year to 2-digit if needed
                if year >= 1900:
                    year = year % 100
                
                # Filter by month and year first
                conditions.append('"MM" = %s AND "JJ" = %s')
                sql_params.extend([month, year])
                
                # Then apply day range if specified
                if from_val is not None and to_val is not None:
                    from_day = int(from_val)
                    to_day = int(to_val)
                    conditions.append('"TT" BETWEEN %s AND %s')
                    sql_params.extend([from_day, to_day])
            except (ValueError, TypeError):
                pass
            return
        
        if from_val is None or to_val is None:
            return
        
        # Special handling for ZZ (time) - uses ZS field
        if param_name == 'ZZ':
            use_local = params.get(f'{prefix}_timezone') == 'local'
            try:
                from_hour = float(from_val)
                to_hour = float(to_val)
                
                if use_local:
                    # TODO: Implement timezone conversion in SQL
                    # For now, use CET (no conversion)
                    conditions.append('"ZS" BETWEEN %s AND %s')
                    sql_params.extend([int(from_hour), int(to_hour)])
                else:
                    conditions.append('"ZS" BETWEEN %s AND %s')
                    sql_params.extend([int(from_hour), int(to_hour)])
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for SH (solar altitude) - uses calculate_solar_altitude()
        if param_name == 'SH':
            try:
                from_alt = int(from_val)
                to_alt = int(to_val)
                sh_type = params.get('sh_type', 'mean')
                
                # Only for sun observations (o=1) at known locations (g != 1)
                # Need observer coordinates - this requires JOIN with observers table
                # For now, we'll use a simplified approach:
                # Filter o=1 and g != 1, then calculate altitude in SQL
                
                # TODO: Need to join with observers table to get coordinates
                # For now, add basic filter and calculate altitude inline
                conditions.append('"O" = 1 AND "g" != 1')
                
                # Add calculate_solar_altitude() to WHERE clause
                # This requires observer data to be available in the query
                # We'll handle this in the execute function
                
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for JJ (year)
        if param_name == 'JJ':
            try:
                from_year = int(from_val)
                to_year = int(to_val)
                
                # Convert 4-digit to 2-digit
                if from_year >= 1900:
                    from_year = from_year % 100
                if to_year >= 1900:
                    to_year = to_year % 100
                
                # Handle ranges crossing century boundary
                if from_year > to_year:
                    conditions.append('("JJ" BETWEEN %s AND 99 OR "JJ" BETWEEN 0 AND %s)')
                    sql_params.extend([from_year, to_year])
                else:
                    conditions.append('"JJ" BETWEEN %s AND %s')
                    sql_params.extend([from_year, to_year])
            except (ValueError, TypeError):
                pass
            return
        
        # Special handling for HO_HU (pillar)
        if param_name == 'HO_HU':
            try:
                from_height = int(from_val)
                to_height = int(to_val)
                
                # Match if either HO or HU is in range
                # Parse pillar field "8HHHH" where HH=HO (pos 2-3), HH=HU (pos 4-5)
                conditions.append("""
                    (SUBSTRING(pillar, 2, 2)::INTEGER BETWEEN %s AND %s 
                     OR SUBSTRING(pillar, 4, 2)::INTEGER BETWEEN %s AND %s)
                """)
                sql_params.extend([from_height, to_height, from_height, to_height])
            except (ValueError, TypeError):
                pass
            return
        
        # Standard numeric range parameters
        try:
            # Use quoted identifiers for HALO key fields
            db_field = f'"{param_name}"'
            
            from_num = int(from_val)
            to_num = int(to_val)
            conditions.append(f"{db_field} BETWEEN %s AND %s")
            sql_params.extend([from_num, to_num])
        except (ValueError, TypeError):
            pass
    
    # Process filters and ranges
    add_filter('filter1')
    add_filter('filter2')
    add_param_range('param1')
    
    # Only add param2 range if param2 is specified
    if params.get('param2'):
        add_param_range('param2')
    
    # Join all conditions with AND
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    return where_clause, sql_params


def execute_single_param_analysis(params: dict) -> dict:
    """
    Execute single-parameter analysis with GROUP BY in SQL.
    
    Returns counts grouped by the selected parameter value.
    Applies filters and parameter ranges from params dict.
    
    Args:
        params: Analysis parameters including:
            - param1: Parameter to group by (MM, JJ, EE, etc.)
            - param1_from, param1_to: Range limits
            - filter1, filter1_value: First filter
            - filter2, filter2_value: Second filter
            - Other parameter-specific options
    
    Returns:
        Dict with {value: count} for each unique parameter value
        
    Example:
        >>> params = {'param1': 'MM', 'param1_from': 1, 'param1_to': 12}
        >>> result = execute_single_param_analysis(params)
        >>> # result = {1: 45, 2: 38, 3: 52, ...}
    """
    param1 = params.get('param1')
    if not param1:
        return {}
    
    # Build WHERE clause
    where_sql, sql_params = build_analysis_sql(params)
    
    # Use quoted identifiers for HALO key fields
    # Special case: ZZ uses ZS field
    if param1 == 'ZZ':
        db_field = '"ZS"'
    elif param1 == 'JJ':
        # Year: convert 2-digit to 4-digit (JJ < 50 = 20xx, JJ >= 50 = 19xx)
        db_field = f'CASE WHEN "JJ" >= {YEAR_CUTOFF} THEN "JJ" + 1900 ELSE "JJ" + 2000 END'
    else:
        db_field = f'"{param1}"'
    
    # Special handling for SH (solar altitude) - requires calculation with JOIN
    if param1 == 'SH':
        # Get altitude type (min, mean, max)
        sh_type = params.get('sh_type', 'mean')
        
        # Get range limits if specified
        from_alt = params.get('param1_from')
        to_alt = params.get('param1_to')
        
        with get_connection() as conn:
            with conn.cursor() as cursor:
                # Build subquery with optional WHERE clause for range filter
                # Use subquery because PostgreSQL doesn't allow column aliases in HAVING
                where_clause_inner = f"""
                    WHERE {where_sql}
                        AND o."O" = 1  -- Sun observations only
                        AND o."g" != 1  -- Not generalized observations
                """
                
                if from_alt is not None and to_alt is not None:
                    # Use subquery with WHERE on calculated altitude
                    query = f"""
                        SELECT altitude, COUNT(*) as count
                        FROM (
                            SELECT 
                                calculate_solar_altitude(
                                    o."JJ", o."MM", o."TT", o."ZS", o."ZM", o."d",
                                    obs.primary_lon_deg, obs.primary_lon_min, obs.primary_lon_dir,
                                    obs.primary_lat_deg, obs.primary_lat_min, obs.primary_lat_dir,
                                    %s
                                ) as altitude
                            FROM observations o
                            JOIN observers obs ON obs.kk = o."KK"
                                AND CAST(SUBSTRING(obs.since FROM 4 FOR 2) AS INTEGER) <= o."JJ"
                                AND obs.since = (
                                    SELECT MAX(obs2.since) 
                                    FROM observers obs2 
                                    WHERE obs2.kk = o."KK"
                                        AND CAST(SUBSTRING(obs2.since FROM 4 FOR 2) AS INTEGER) <= o."JJ"
                                )
                            {where_clause_inner}
                        ) AS subquery
                        WHERE altitude BETWEEN %s AND %s
                        GROUP BY altitude
                        ORDER BY altitude
                    """
                    cursor.execute(query, [sh_type] + sql_params + [int(from_alt), int(to_alt)])
                else:
                    # No range filter - simpler query without subquery
                    query = f"""
                        SELECT 
                            calculate_solar_altitude(
                                o."JJ", o."MM", o."TT", o."ZS", o."ZM", o."d",
                                obs.primary_lon_deg, obs.primary_lon_min, obs.primary_lon_dir,
                                obs.primary_lat_deg, obs.primary_lat_min, obs.primary_lat_dir,
                                %s
                            ) as altitude,
                            COUNT(*) as count
                        FROM observations o
                        JOIN observers obs ON obs.kk = o."KK"
                            AND CAST(SUBSTRING(obs.since FROM 4 FOR 2) AS INTEGER) <= o."JJ"
                            AND obs.since = (
                                SELECT MAX(obs2.since) 
                                FROM observers obs2 
                                WHERE obs2.kk = o."KK"
                                    AND CAST(SUBSTRING(obs2.since FROM 4 FOR 2) AS INTEGER) <= o."JJ"
                            )
                        {where_clause_inner}
                        GROUP BY altitude
                        ORDER BY altitude
                    """
                    cursor.execute(query, [sh_type] + sql_params)
                
                rows = cursor.fetchall()
                
                result = {}
                for row in rows:
                    altitude = row[0]
                    count = row[1]
                    if altitude is not None:
                        result[altitude] = count
                
                return result
    
    # Special handling for HO_HU (pillar height)
    if param1 == 'HO_HU':
        # Parse pillar field "8HHHH" and extract HO/HU values
        # Use UNION to get both HO and HU values separately
        with get_connection() as conn:
            with conn.cursor() as cursor:
                query = f"""
                    SELECT height, COUNT(*) as count FROM (
                        SELECT NULLIF(SUBSTRING(pillar, 2, 2), '')::INTEGER as height
                        FROM observations
                        WHERE {where_sql} AND pillar IS NOT NULL AND pillar != ''
                        UNION ALL
                        SELECT NULLIF(SUBSTRING(pillar, 4, 2), '')::INTEGER as height
                        FROM observations
                        WHERE {where_sql} AND pillar IS NOT NULL AND pillar != ''
                    ) AS heights
                    WHERE height IS NOT NULL AND height > 0
                    GROUP BY height
                    ORDER BY height
                """
                
                cursor.execute(query, sql_params + sql_params)
                rows = cursor.fetchall()
                
                result = {}
                for row in rows:
                    height = row[0]
                    count = row[1]
                    if height is not None:
                        result[height] = count
                
                return result
    
    # Special handling for SE (sectors) - extract octant letters
    if param1 == 'SE':
        # Parse sectors string and count each octant letter (a-h)
        # Split at any non-letter character (-, space, etc.) to handle formats like "a-b-c e-f"
        with get_connection() as conn:
            with conn.cursor() as cursor:
                query = f"""
                    SELECT 
                        LOWER(TRIM(octant)) as octant, 
                        COUNT(DISTINCT o.ctid) as count
                    FROM observations o
                    CROSS JOIN LATERAL regexp_split_to_table(o.sectors, '[^a-hA-H]+') AS octant
                    WHERE {where_sql}
                        AND TRIM(octant) != ''
                        AND LOWER(TRIM(octant)) ~ '^[a-h]$'
                    GROUP BY LOWER(TRIM(octant))
                    ORDER BY octant
                """
                
                cursor.execute(query, sql_params)
                rows = cursor.fetchall()
                
                # Convert to dict {octant: count}
                result = {}
                for row in rows:
                    octant = row[0]
                    count = row[1]
                    if octant and count > 0:
                        result[octant] = count
                
                return result
    
    # Standard query with GROUP BY
    with get_connection() as conn:
        with conn.cursor() as cursor:
            query = f"""
                SELECT {db_field} as value, COUNT(*) as count
                FROM observations
                WHERE {where_sql}
                GROUP BY value
                ORDER BY value
            """
            
            cursor.execute(query, sql_params)
            rows = cursor.fetchall()
            
            # Convert to dict {value: count}
            result = {}
            for row in rows:
                value = row[0]
                count = row[1]
                if value is not None:  # Skip NULL values
                    result[value] = count
            
            return result


def execute_two_param_analysis(params: dict) -> dict:
    """
    Execute two-parameter analysis (cross-tabulation) with GROUP BY in SQL.
    
    Returns counts grouped by both parameters (2D matrix).
    Applies filters and parameter ranges from params dict.
    
    Args:
        params: Analysis parameters including:
            - param1: First parameter (MM, JJ, EE, etc.)
            - param2: Second parameter (different from param1)
            - param1_from, param1_to: Range limits for param1
            - param2_from, param2_to: Range limits for param2
            - filter1, filter1_value: First filter
            - filter2, filter2_value: Second filter
    
    Returns:
        Nested dict with {param1_value: {param2_value: count}}
        
    Example:
        >>> params = {'param1': 'MM', 'param2': 'EE', ...}
        >>> result = execute_two_param_analysis(params)
        >>> # result = {1: {22: 12, 23: 8}, 2: {22: 5, 23: 15}, ...}
    """
    param1 = params.get('param1')
    param2 = params.get('param2')
    
    if not param1 or not param2:
        return {}
    
    # Build WHERE clause
    where_sql, sql_params = build_analysis_sql(params)
    
    # Use quoted identifiers for both parameters
    # Special case: ZZ uses ZS field
    def get_db_field(param_name: str) -> str:
        if param_name == 'ZZ':
            return '"ZS"'
        else:
            return f'"{param_name}"'
    
    db_field1 = get_db_field(param1)
    db_field2 = get_db_field(param2)
    
    # Special handling for complex parameters (SH, HO_HU, SE)
    if param1 in ['SH', 'HO_HU', 'SE'] or param2 in ['SH', 'HO_HU', 'SE']:
        # TODO: Implement complex parameter queries
        return {}
    
    # Standard cross-tabulation query
    with get_connection() as conn:
        with conn.cursor() as cursor:
            query = f"""
                SELECT {db_field1}, {db_field2}, COUNT(*) as count
                FROM observations
                WHERE {where_sql}
                GROUP BY {db_field1}, {db_field2}
                ORDER BY {db_field1}, {db_field2}
            """
            
            cursor.execute(query, sql_params)
            rows = cursor.fetchall()
            
            # Convert to nested dict {param1_value: {param2_value: count}}
            result = {}
            for row in rows:
                value1 = row[0]
                value2 = row[1]
                count = row[2]
                
                # Skip NULL values
                if value1 is None or value2 is None:
                    continue
                
                # Build nested dict structure
                if value1 not in result:
                    result[value1] = {}
                result[value1][value2] = count
            
            return result
