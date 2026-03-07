"""
Database Operations for Observers (Layer 3b)

PostgreSQL-based storage implementation for observers.
Implements same interface as observers_file.py but uses SQL.

Author: HALOpy Team
Date: 2026-02-09
"""

# Optional import - only needed for cloud mode
try:
    import psycopg2  # type: ignore[import-untyped]
    from psycopg2.extras import RealDictCursor  # type: ignore[import-untyped]
except ImportError:
    psycopg2 = None  # type: ignore
    RealDictCursor = None  # type: ignore

from typing import Any, Dict, List, Optional
from halo.io.db_connection import get_connection
from halo.models.constants import YEAR_MIN  # For century boundary calculation


# ========================================
# Format Conversion
# ========================================

def _db_to_csv_format(db_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Minimal format normalization for database records.
    Since DB now uses Python field names, just normalize types and formats.
    
    Args:
        db_record: Record from database (already has correct field names)
        
    Returns:
        Normalized record in Python format
    """
    # Normalize seit to MM/JJ format (ensure 2-digit year)
    seit = db_record.get('seit', '')
    if seit and '/' in seit:
        parts = seit.split('/')
        if len(parts) == 2:
            month = parts[0].zfill(2)  # Ensure 2-digit month
            year = parts[1]
            # If year is 4 digits, extract last 2 digits
            if len(year) == 4:
                year = year[-2:]
            seit = f"{month}/{year.zfill(2)}"  # Ensure 2-digit year
    
    # DB now returns correct field names, just normalize types
    result = dict(db_record)  # Copy all fields
    result['KK'] = str(result['KK']).zfill(2)  # Ensure 2-digit string
    result['seit'] = seit
    return result


# ========================================
# READ Operations
# ========================================

def load_all() -> List[Dict[str, Any]]:
    """
    Load all observer records from database, sorted by kk, since.
    
    Returns:
        List of observer records in CSV-compatible format (same as Local Mode)
        
    Example:
        >>> records = load_all()
        >>> print(f"Loaded {len(records)} observer records")
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("""
                SELECT "KK", "VName", "NName", "seit", "aktiv",
                       "HbOrt", "GH", "HLG", "HLM", "HOW", "HBG", "HBM", "HNS",
                       "NbOrt", "GN", "NLG", "NLM", "NOW", "NBG", "NBM", "NNS"
                FROM observers
                ORDER BY "KK",
                         -- Sort by actual year (years < (YEAR_MIN-1900) are 2000+, >= (YEAR_MIN-1900) are 1900+)
                         CAST(SPLIT_PART("seit", '/', 1) AS INTEGER) + 13 * 
                         CASE 
                             WHEN CAST(SPLIT_PART("seit", '/', 2) AS INTEGER) < %s
                             THEN CAST(SPLIT_PART("seit", '/', 2) AS INTEGER) + 100
                             ELSE CAST(SPLIT_PART("seit", '/', 2) AS INTEGER)
                         END
            """, (YEAR_MIN - 1900,))
            
            rows = cursor.fetchall()
            
            # Convert to CSV-compatible format
            return [_db_to_csv_format(dict(row)) for row in rows]


def load_filtered(**filters) -> List[Dict[str, Any]]:
    """
    Load observer records with filters.
    
    Supported filters:
    - KK: Observer code (int)
    - aktiv: Active status (int: 0/1)
    - seit: Validity date (str, exact match)
    - VName, NName: Name (str, LIKE partial match)
    - HbOrt, GH: Primary site (str, LIKE partial match)
    - NbOrt, GN: Secondary site (str, LIKE partial match)
    - standort: Site search (str, searches both HbOrt and NbOrt)
    - region: Region search (int, searches both GH and GN)
    - latest_only: If True, returns only latest record per KK (bool)
    - jj, mm: Year/Month for date-based validity filtering (int)
    
    Args:
        **filters: Field name → value
        
    Returns:
        List of observer records (dicts) matching filters, sorted by kk, since
        
    Examples:
        >>> # Observer 44
        >>> records = load_filtered(kk=44)
        
        >>> # Active observers
        >>> records = load_filtered(active=1)
        
        >>> # Observers in region 'Nord'
        >>> records = load_filtered(geographic_region='Nord')
        
        >>> # Search by site name
        >>> records = load_filtered(standort='Berlin')
        
        >>> # Latest records only
        >>> records = load_filtered(latest_only=True)
        
        >>> # Observer valid for specific date
        >>> records = load_filtered(kk=44, jj=26, mm=3)
    """
    if not filters:
        return load_all()
    
    # Handle special complex filters first
    latest_only = filters.pop('latest_only', False)
    standort = filters.pop('standort', None)
    region = filters.pop('region', None)
    jj = filters.pop('jj', None)
    mm = filters.pop('mm', None)
    
    with get_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            # Build WHERE clause dynamically
            where_clauses = []
            params = []
            
            # Handle site search (both HbOrt and NbOrt)
            if standort:
                where_clauses.append("(\"HbOrt\" LIKE %s OR \"NbOrt\" LIKE %s)")
                params.extend([f"%{standort}%", f"%{standort}%"])
            
            # Handle region search (both GH and GN)
            if region:
                where_clauses.append("(\"GH\" = %s OR \"GN\" = %s)")
                params.extend([region, region])
            
            # Handle date-based validity filtering
            if jj is not None and mm is not None:
                # Calculate seit value for observation date
                # Handle century boundary (YEAR_MIN = 1980, so YEAR_MIN-1900 = 80)
                # Normalize 4-digit year to 2-digit for seit comparison
                year = jj % 100 if jj >= 100 else jj
                if year < (YEAR_MIN - 1900):  # Years 00-79 are 2000-2079
                    year += 100
                obs_seit = mm + 13 * year
                
                # Convert database seit (MM/YY format) to seit value for comparison
                where_clauses.append("""
                    (CAST(SPLIT_PART(\"seit\", '/', 1) AS INTEGER) + 13 * 
                     CASE 
                         WHEN CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER) < %s
                         THEN CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER) + 100
                         ELSE CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER)
                     END) <= %s
                """)
                params.extend([YEAR_MIN - 1900, obs_seit])
            
            # Fields that use LIKE for partial matching
            like_fields = {'VName', 'NName', 'HbOrt', 'GH', 'NbOrt', 'GN'}
            
            # Map API parameter names to DB column names
            field_mapping = {
                'kk': 'KK',
                'vname': 'VName',
                'nname': 'NName',
                'seit': 'seit',
                'aktiv': 'aktiv',
                'hbort': 'HbOrt',
                'gh': 'GH',
                'hlg': 'HLG',
                'hlm': 'HLM',
                'how': 'HOW',
                'hbg': 'HBG',
                'hbm': 'HBM',
                'hns': 'HNS',
                'nbort': 'NbOrt',
                'gn': 'GN',
                'nlg': 'NLG',
                'nlm': 'NLM',
                'now': 'NOW',
                'nbg': 'NBG',
                'nbm': 'NBM',
                'nns': 'NNS'
            }
            
            # Handle remaining standard filters
            for field, value in filters.items():
                # Map API parameter to DB column name
                db_field = field_mapping.get(field, field)
                
                if db_field in like_fields:
                    # Partial match with LIKE
                    where_clauses.append(f'"{db_field}" LIKE %s')
                    params.append(f"%{value}%")
                else:
                    # Exact match
                    where_clauses.append(f'"{db_field}" = %s')
                    params.append(value)
            
            # Build query
            if where_clauses:
                where_sql = " AND ".join(where_clauses)
                query = f"""
                    SELECT "KK", "VName", "NName", "seit", "aktiv",
                           "HbOrt", "GH", "HLG", "HLM", "HOW", "HBG", "HBM", "HNS",
                           "NbOrt", "GN", "NLG", "NLM", "NOW", "NBG", "NBM", "NNS"
                    FROM observers
                    WHERE {where_sql}
                    ORDER BY "KK",
                             CAST(SPLIT_PART(\"seit\", '/', 1) AS INTEGER) + 13 * 
                             CASE 
                                 WHEN CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER) < %s
                                 THEN CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER) + 100
                                 ELSE CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER)
                             END
                """
                params.append(YEAR_MIN - 1900)  # Add to params for ORDER BY
            else:
                query = """
                    SELECT "KK", "VName", "NName", "seit", "aktiv",
                           "HbOrt", "GH", "HLG", "HLM", "HOW", "HBG", "HBM", "HNS",
                           "NbOrt", "GN", "NLG", "NLM", "NOW", "NBG", "NBM", "NNS"
                    FROM observers
                    ORDER BY "KK",
                             CAST(SPLIT_PART(\"seit\", '/', 1) AS INTEGER) + 13 * 
                             CASE 
                                 WHEN CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER) < %s
                                 THEN CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER) + 100
                                 ELSE CAST(SPLIT_PART(\"seit\", '/', 2) AS INTEGER)
                             END
                """
                params = [YEAR_MIN - 1900]  # Params for ORDER BY
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Convert to Python format (minimal conversion needed)
            records = [_db_to_csv_format(dict(row)) for row in rows]
            
            # Handle latest_only filter (done in Python for simplicity)
            if latest_only:
                latest_records = {}
                for record in records:
                    kk = record['KK']  # Using Python format keys
                    since = record['seit']
                    
                    # Parse seit (MM/YY) to compare dates
                    try:
                        month, year = map(int, since.split('/'))
                        # Convert to full year
                        full_year = year + (2000 if year < 80 else 1900)
                        date_key = (full_year, month)
                        
                        if kk not in latest_records or date_key > latest_records[kk][1]:
                            latest_records[kk] = (record, date_key)
                    except (ValueError, AttributeError):
                        # If date parsing fails, keep the record
                        if kk not in latest_records:
                            latest_records[kk] = (record, (0, 0))
                
                records = [rec_tuple[0] for rec_tuple in latest_records.values()]
                # Re-sort by KK (now using CSV format)
                records.sort(key=lambda x: x['KK'])
            
            return records


def count() -> int:
    """
    Count total number of observer records in database.
    
    Returns:
        Total observer record count
        
    Example:
        >>> total = count()
        >>> print(f"Database contains {total} observer records")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM observers")
            result = cursor.fetchone()
            return result[0] if result else 0


# ========================================
# WRITE Operations
# ========================================

def save_one(record: Dict[str, Any]) -> bool:
    """
    Insert new observer record.
    
    Args:
        record: Dict with column names as keys
        
    Returns:
        True if inserted successfully
        False if duplicate key (kk, since)
        
    Example:
        >>> record = {'KK': '44', 'VName': 'Max', 'NName': 'Mustermann', ...}
        >>> if save_one(record):
        ...     print("Observer record saved")
        ... else:
        ...     print("Duplicate record (kk, since)")
    """
    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO observers (
                        "KK", "VName", "NName", "seit", "aktiv",
                        "HbOrt", "GH", "HLG", "HLM", "HOW", "HBG", "HBM", "HNS",
                        "NbOrt", "GN", "NLG", "NLM", "NOW", "NBG", "NBM", "NNS"
                    ) VALUES (
                        %(KK)s, %(VName)s, %(NName)s, %(seit)s, %(aktiv)s,
                        %(HbOrt)s, %(GH)s, %(HLG)s, %(HLM)s, %(HOW)s, %(HBG)s, %(HBM)s, %(HNS)s,
                        %(NbOrt)s, %(GN)s, %(NLG)s, %(NLM)s, %(NOW)s, %(NBG)s, %(NBM)s, %(NNS)s
                    )
                """, record)
                
                conn.commit()
                return True
                
        except psycopg2.IntegrityError:
            # Duplicate key (kk, since)
            conn.rollback()
            return False


def update_one(kk: int, seit: str, record: Dict[str, Any]) -> bool:
    """
    Update existing observer record.
    
    Args:
        kk: Observer code
        seit: Validity date (format: MM/YY)
        record: Updated record (dict with column names as keys)
        
    Returns:
        True if updated (1 row affected)
        False if not found (0 rows affected)
        
    Example:
        >>> record = {'KK': '44', 'VName': 'Max', ...}
        >>> if update_one(44, '04/26', record):
        ...     print("Observer record updated")
        ... else:
        ...     print("Record not found")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Prepare parameters with WHERE clause values
            params = dict(record)
            params['_where_kk'] = kk
            params['_where_seit'] = seit
            
            cursor.execute("""
                UPDATE observers SET
                    "KK"=%(KK)s, "VName"=%(VName)s, "NName"=%(NName)s,
                    "seit"=%(seit)s, "aktiv"=%(aktiv)s,
                    "HbOrt"=%(HbOrt)s, "GH"=%(GH)s,
                    "HLG"=%(HLG)s, "HLM"=%(HLM)s, "HOW"=%(HOW)s,
                    "HBG"=%(HBG)s, "HBM"=%(HBM)s, "HNS"=%(HNS)s,
                    "NbOrt"=%(NbOrt)s, "GN"=%(GN)s,
                    "NLG"=%(NLG)s, "NLM"=%(NLM)s, "NOW"=%(NOW)s,
                    "NBG"=%(NBG)s, "NBM"=%(NBM)s, "NNS"=%(NNS)s
                WHERE "KK"=%(_where_kk)s AND "seit"=%(_where_seit)s
            """, params)
            
            affected_rows = cursor.rowcount
            conn.commit()
            return affected_rows > 0


def delete_one(kk: int, seit: str) -> bool:
    """
    Delete observer record.
    
    Args:
        kk: Observer code
        seit: Validity date (format: MM/YY)
        
    Returns:
        True if deleted (1 row affected)
        False if not found (0 rows affected)
        
    Example:
        >>> if delete_one(44, '04/26'):
        ...     print("Observer record deleted")
        ... else:
        ...     print("Record not found")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM observers
                WHERE "KK"=%s AND "seit"=%s
            """, (kk, seit))
            
            affected_rows = cursor.rowcount
            conn.commit()
            return affected_rows > 0
