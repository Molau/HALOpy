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
# Helper Functions: Python ↔ PostgreSQL Mapping
# ========================================

def _observation_to_tuple(obs: Observation) -> Tuple:
    """
    Convert Observation object to tuple for SQL INSERT/UPDATE.
    
    Mappings:
    - Python uppercase fields → PostgreSQL lowercase columns
    - HO/HU fields → pillar column ("8HHHH" format)
    - Python c → DB c (lower cloud AFTER)
    - Python C → DB cc (UPPER cloud AFTER)
    - Python F → DB f (color)
    - Python f → DB ff (weather front)
    
    Args:
        obs: Observation object
        
    Returns:
        Tuple of 23 values matching PostgreSQL column order:
        kk, o, jj, mm, tt, g, zs, zm, d, dd, n, c, cc, ee, h, f, v, ff, zz, gg, pillar, sectors, remarks
    """
    # Format pillar field: "8HHHH" where HH=HO, HH=HU
    pillar = f"8{obs.HO:02d}{obs.HU:02d}" if obs.HO > 0 or obs.HU > 0 else ""
    
    return (
        obs.KK, obs.O, obs.JJ, obs.MM, obs.TT, obs.g,
        obs.ZS, obs.ZM, obs.d, obs.DD, obs.N, obs.c, obs.C,  # NOTE: c before C to match DB order (c, cc)
        obs.EE, obs.H, obs.F, obs.V, obs.f, obs.zz, obs.GG,  # NOTE: F before f to match DB order (f, ff)
        pillar, obs.sectors, obs.remarks
    )


def _tuple_to_observation(row: Tuple) -> Observation:
    """
    Convert PostgreSQL row to Observation object.
    
    Mappings:
    - PostgreSQL lowercase columns → Python uppercase fields
    - PostgreSQL NULL → Python -1 (not observed)
    - pillar column → HO/HU fields (parse "8HHHH")
    - cc column → C field
    - ff column → f field
    
    Args:
        row: Database row tuple (23 values)
        
    Returns:
        Observation object
    """
    # Helper to convert NULL to -1 for OPTIONAL fields
    # NOTE: Fields with NOT NULL in DB schema should NEVER be NULL:
    #   KK, O, JJ, MM, TT, g, EE, GG (always have values)
    # Optional fields with DEFAULT -1:
    #   ZS, ZM, d, DD, N, C, c, H, F, V, f, zz
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
    
    # SQL SELECT order: kk, o, jj, mm, tt, g, zs, zm, d, dd, n, c, cc, ee, h, f, v, ff, zz, gg, pillar, sectors, remarks
    # Index mapping: 0   1  2   3   4   5  6   7   8  9   10  11 12  13  14 15 16 17  18  19  20      21       22
    # NOTE: DB columns are lowercase (c, cc, f, ff), Python fields are C, c, F, f
    #       DB 'c' (index 11) → Python 'c' (lower cloud AFTER)
    #       DB 'cc' (index 12) → Python 'C' (UPPER cloud AFTER - note the swap!)
    #       DB 'f' (index 15) → Python 'F' (color)
    #       DB 'ff' (index 17) → Python 'f' (weather front)
    
    return Observation(
        # NOT NULL fields - use directly (never NULL in database)
        KK=row[0], 
        O=row[1], 
        JJ=row[2], 
        MM=row[3], 
        TT=row[4], 
        g=row[5],              # NOT NULL DEFAULT 0 in DB
        EE=row[13],            # NOT NULL in DB
        GG=row[19],            # NOT NULL in DB
        
        # Optional fields - convert NULL to -1
        ZS=null_to_minus1(row[6]), 
        ZM=null_to_minus1(row[7]), 
        d=null_to_minus1(row[8]), 
        DD=null_to_minus1(row[9]), 
        N=null_to_minus1(row[10]), 
        c=null_to_minus1(row[11]),  # DB column 'c' → Python field 'c' (lower cloud AFTER)
        C=null_to_minus1(row[12]),  # DB column 'cc' → Python field 'C' (UPPER cloud AFTER)
        H=null_to_minus1(row[14]), 
        F=null_to_minus1(row[15]),  # DB column 'f' → Python field 'F' (color)
        V=null_to_minus1(row[16]), 
        f=null_to_minus1(row[17]),  # DB column 'ff' → Python field 'f' (weather front)
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
                SELECT kk, o, jj, mm, tt, g,
                       zs, zm, d, dd, n, c, cc,
                       ee, h, f, v, ff, zz, gg,
                       pillar, sectors, remarks
                FROM observations
                ORDER BY 
                    CASE WHEN jj >= {YEAR_CUTOFF} THEN jj + 1900 ELSE jj + 2000 END,
                    mm, tt, zs, zm, kk, ee, gg
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
                # Convert Python uppercase to PostgreSQL lowercase
                db_field = field.lower()
                
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
                SELECT kk, o, jj, mm, tt, g,
                       zs, zm, d, dd, n, c, cc,
                       ee, h, f, v, ff, zz, gg,
                       pillar, sectors, remarks
                FROM observations
                WHERE {where_sql}
                ORDER BY 
                    CASE WHEN jj >= {YEAR_CUTOFF} THEN jj + 1900 ELSE jj + 2000 END,
                    mm, tt, zs, zm, kk, ee, gg
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
                        kk, o, jj, mm, tt, g,
                        zs, zm, d, dd, n, c, cc,
                        ee, h, f, v, ff, zz, gg,
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
                    kk=%s, o=%s, jj=%s, mm=%s, tt=%s, g=%s,
                    zs=%s, zm=%s, d=%s, dd=%s, n=%s, c=%s, cc=%s,
                    ee=%s, h=%s, f=%s, v=%s, ff=%s, zz=%s, gg=%s,
                    pillar=%s, sectors=%s, remarks=%s
                WHERE kk=%s AND o=%s AND jj=%s AND mm=%s AND tt=%s AND ee=%s AND gg=%s
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
                WHERE kk=%s AND o=%s AND jj=%s AND mm=%s AND tt=%s AND ee=%s AND gg=%s
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
            cursor.execute("DELETE FROM observations WHERE kk=%s", (kk,))
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
                            kk, o, jj, mm, tt, g,
                            zs, zm, d, dd, n, c, cc,
                            ee, h, f, v, ff, zz, gg,
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
