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
    Convert database record format to CSV-like format for compatibility.
    
    This ensures Cloud Mode uses same format as Local Mode (CSV):
    - Convert boolean True/False to int 0/1
    - Use same field names as CSV
    - Convert None to empty string or 0
    - Normalize seit to MM/JJ format (2-digit year)
    
    Args:
        db_record: Record from database (RealDictRow converted to dict)
        
    Returns:
        Record in CSV-compatible format
    """
    # Normalize seit to MM/JJ format (ensure 2-digit year)
    seit = db_record['since']
    if seit and '/' in seit:
        parts = seit.split('/')
        if len(parts) == 2:
            month = parts[0].zfill(2)  # Ensure 2-digit month
            year = parts[1]
            # If year is 4 digits, extract last 2 digits
            if len(year) == 4:
                year = year[-2:]
            seit = f"{month}/{year.zfill(2)}"  # Ensure 2-digit year
    
    return {
        'KK': str(db_record['kk']).zfill(2),
        'VName': db_record['first_name'] or '',
        'NName': db_record['last_name'] or '',
        'seit': seit,
        'aktiv': 1 if db_record['active'] else 0,  # Convert bool to 0/1
        'HbOrt': db_record['primary_site'] or '',
        'GH': db_record['primary_region'],
        'HLG': int(db_record['primary_lon_deg']) if db_record['primary_lon_deg'] else 0,
        'HLM': int(db_record['primary_lon_min']) if db_record['primary_lon_min'] else 0,
        'HOW': db_record['primary_lon_dir'] or '',
        'HBG': int(db_record['primary_lat_deg']) if db_record['primary_lat_deg'] else 0,
        'HBM': int(db_record['primary_lat_min']) if db_record['primary_lat_min'] else 0,
        'HNS': db_record['primary_lat_dir'] or '',
        'NbOrt': db_record['secondary_site'] or '',
        'GN': db_record['secondary_region'],
        'NLG': int(db_record['secondary_lon_deg']) if db_record['secondary_lon_deg'] else 0,
        'NLM': int(db_record['secondary_lon_min']) if db_record['secondary_lon_min'] else 0,
        'NOW': db_record['secondary_lon_dir'] or '',
        'NBG': int(db_record['secondary_lat_deg']) if db_record['secondary_lat_deg'] else 0,
        'NBM': int(db_record['secondary_lat_min']) if db_record['secondary_lat_min'] else 0,
        'NNS': db_record['secondary_lat_dir'] or ''
    }


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
                SELECT kk, first_name, last_name, since, active,
                       primary_site, primary_region,
                       primary_lon_deg, primary_lon_min, primary_lon_dir,
                       primary_lat_deg, primary_lat_min, primary_lat_dir,
                       secondary_site, secondary_region,
                       secondary_lon_deg, secondary_lon_min, secondary_lon_dir,
                       secondary_lat_deg, secondary_lat_min, secondary_lat_dir
                FROM observers
                ORDER BY kk,
                         -- Sort by actual year (years < (YEAR_MIN-1900) are 2000+, >= (YEAR_MIN-1900) are 1900+)
                         CAST(SPLIT_PART(since, '/', 1) AS INTEGER) + 13 * 
                         CASE 
                             WHEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) < %s
                             THEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) + 100
                             ELSE CAST(SPLIT_PART(since, '/', 2) AS INTEGER)
                         END
            """, (YEAR_MIN - 1900,))
            
            rows = cursor.fetchall()
            
            # Convert to CSV-compatible format
            return [_db_to_csv_format(dict(row)) for row in rows]


def load_filtered(**filters) -> List[Dict[str, Any]]:
    """
    Load observer records with filters.
    
    Supported filters:
    - kk: Observer code (int)
    - active: Active status (bool or int: 0/1)
    - since: Validity date (str, exact match)
    - first_name, last_name: Name (str, LIKE partial match)
    - primary_site, primary_region: Primary site (str, LIKE partial match)
    - secondary_site, secondary_region: Secondary site (str, LIKE partial match)
    - standort: Site search (str, searches both primary_site and secondary_site)
    - region: Region search (int, searches both primary_region and secondary_region)
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
            
            # Handle site search (both primary_site and secondary_site)
            if standort:
                where_clauses.append("(primary_site LIKE %s OR secondary_site LIKE %s)")
                params.extend([f"%{standort}%", f"%{standort}%"])
            
            # Handle region search (both primary_region and secondary_region)
            if region:
                where_clauses.append("(primary_region = %s OR secondary_region = %s)")
                params.extend([region, region])
            
            # Handle date-based validity filtering
            if jj is not None and mm is not None:
                # Calculate seit value for observation date
                # Handle century boundary (YEAR_MIN = 1980, so YEAR_MIN-1900 = 80)
                year = jj
                if jj < (YEAR_MIN - 1900):  # Years 00-79 are 2000-2079
                    year += 100
                obs_seit = mm + 13 * year
                
                # Convert database since (MM/YY format) to seit value for comparison
                where_clauses.append("""
                    (CAST(SPLIT_PART(since, '/', 1) AS INTEGER) + 13 * 
                     CASE 
                         WHEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) < %s
                         THEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) + 100
                         ELSE CAST(SPLIT_PART(since, '/', 2) AS INTEGER)
                     END) <= %s
                """)
                params.extend([YEAR_MIN - 1900, obs_seit])
            
            # Fields that use LIKE for partial matching
            like_fields = {'first_name', 'last_name', 'primary_site', 'primary_region', 
                          'secondary_site', 'secondary_region'}
            
            # Handle remaining standard filters
            for field, value in filters.items():
                if field in like_fields:
                    # Partial match with LIKE
                    where_clauses.append(f"{field} LIKE %s")
                    params.append(f"%{value}%")
                else:
                    # Exact match
                    where_clauses.append(f"{field} = %s")
                    params.append(value)
            
            # Build query
            if where_clauses:
                where_sql = " AND ".join(where_clauses)
                query = f"""
                    SELECT kk, first_name, last_name, since, active,
                           primary_site, primary_region,
                           primary_lon_deg, primary_lon_min, primary_lon_dir,
                           primary_lat_deg, primary_lat_min, primary_lat_dir,
                           secondary_site, secondary_region,
                           secondary_lon_deg, secondary_lon_min, secondary_lon_dir,
                           secondary_lat_deg, secondary_lat_min, secondary_lat_dir
                    FROM observers
                    WHERE {where_sql}
                    ORDER BY kk,
                             CAST(SPLIT_PART(since, '/', 1) AS INTEGER) + 13 * 
                             CASE 
                                 WHEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) < %s
                                 THEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) + 100
                                 ELSE CAST(SPLIT_PART(since, '/', 2) AS INTEGER)
                             END
                """
                params.append(YEAR_MIN - 1900)  # Add to params for ORDER BY
            else:
                query = """
                    SELECT kk, first_name, last_name, since, active,
                           primary_site, primary_region,
                           primary_lon_deg, primary_lon_min, primary_lon_dir,
                           primary_lat_deg, primary_lat_min, primary_lat_dir,
                           secondary_site, secondary_region,
                           secondary_lon_deg, secondary_lon_min, secondary_lon_dir,
                           secondary_lat_deg, secondary_lat_min, secondary_lat_dir
                    FROM observers
                    ORDER BY kk,
                             CAST(SPLIT_PART(since, '/', 1) AS INTEGER) + 13 * 
                             CASE 
                                 WHEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) < %s
                                 THEN CAST(SPLIT_PART(since, '/', 2) AS INTEGER) + 100
                                 ELSE CAST(SPLIT_PART(since, '/', 2) AS INTEGER)
                             END
                """
                params = [YEAR_MIN - 1900]  # Params for ORDER BY
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Convert to CSV-compatible format
            records = [_db_to_csv_format(dict(row)) for row in rows]
            
            # Handle latest_only filter (done in Python for simplicity)
            if latest_only:
                latest_records = {}
                for record in records:
                    kk = record['KK']  # Now using CSV format keys
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
        >>> record = {'kk': '44', 'first_name': 'Max', 'last_name': 'Mustermann', ...}
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
                        kk, first_name, last_name, since, active,
                        primary_site, primary_region,
                        primary_lon_deg, primary_lon_min, primary_lon_dir,
                        primary_lat_deg, primary_lat_min, primary_lat_dir,
                        secondary_site, secondary_region,
                        secondary_lon_deg, secondary_lon_min, secondary_lon_dir,
                        secondary_lat_deg, secondary_lat_min, secondary_lat_dir
                    ) VALUES (
                        %(kk)s, %(first_name)s, %(last_name)s, %(since)s, %(active)s,
                        %(primary_site)s, %(primary_region)s,
                        %(primary_lon_deg)s, %(primary_lon_min)s, %(primary_lon_dir)s,
                        %(primary_lat_deg)s, %(primary_lat_min)s, %(primary_lat_dir)s,
                        %(secondary_site)s, %(secondary_region)s,
                        %(secondary_lon_deg)s, %(secondary_lon_min)s, %(secondary_lon_dir)s,
                        %(secondary_lat_deg)s, %(secondary_lat_min)s, %(secondary_lat_dir)s
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
        >>> record = {'kk': '44', 'first_name': 'Max', ...}
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
                    kk=%(kk)s, first_name=%(first_name)s, last_name=%(last_name)s,
                    since=%(since)s, active=%(active)s,
                    primary_site=%(primary_site)s, primary_region=%(primary_region)s,
                    primary_lon_deg=%(primary_lon_deg)s, primary_lon_min=%(primary_lon_min)s, primary_lon_dir=%(primary_lon_dir)s,
                    primary_lat_deg=%(primary_lat_deg)s, primary_lat_min=%(primary_lat_min)s, primary_lat_dir=%(primary_lat_dir)s,
                    secondary_site=%(secondary_site)s, secondary_region=%(secondary_region)s,
                    secondary_lon_deg=%(secondary_lon_deg)s, secondary_lon_min=%(secondary_lon_min)s, secondary_lon_dir=%(secondary_lon_dir)s,
                    secondary_lat_deg=%(secondary_lat_deg)s, secondary_lat_min=%(secondary_lat_min)s, secondary_lat_dir=%(secondary_lat_dir)s
                WHERE kk=%(_where_kk)s AND since=%(_where_seit)s
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
                WHERE kk=%s AND since=%s
            """, (kk, seit))
            
            affected_rows = cursor.rowcount
            conn.commit()
            return affected_rows > 0
