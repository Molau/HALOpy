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
except ImportError:
    psycopg2 = None  # type: ignore

from typing import List, Optional
from halo.io.db_connection import get_connection


# ========================================
# READ Operations
# ========================================

def load_all() -> List[List[str]]:
    """
    Load all observer records from database, sorted by kk, since.
    
    Returns:
        List of observer records (each record is list of 21 strings)
        
    Example:
        >>> records = load_all()
        >>> print(f"Loaded {len(records)} observer records")
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT kk, active, since, first_name, last_name,
                       primary_site, primary_region, primary_longitude, primary_latitude, primary_altitude,
                       secondary_site, secondary_region, secondary_longitude, secondary_latitude, secondary_altitude,
                       geographic_region, publication_rights, institution, address, email, phone
                FROM observers
                ORDER BY kk, since
            """)
            
            rows = cursor.fetchall()
            
            # Convert tuples to lists of strings (match file format)
            records = []
            for row in rows:
                record = [str(value) if value is not None else "" for value in row]
                records.append(record)
            
            return records


def load_filtered(**filters) -> List[List[str]]:
    """
    Load observer records with filters.
    
    Supported filters:
    - kk: Observer code (int)
    - active: Active status (bool or int: 0/1)
    - since: Validity date (str, exact match)
    - first_name, last_name: Name (str, LIKE partial match)
    - primary_site, primary_region: Primary site (str, LIKE partial match)
    - secondary_site, secondary_region: Secondary site (str, LIKE partial match)
    - geographic_region: Geographic region (str, exact match)
    
    Args:
        **filters: Field name → value
        
    Returns:
        List of observer records matching filters, sorted by kk, since
        
    Examples:
        >>> # Observer 44
        >>> records = load_filtered(kk=44)
        
        >>> # Active observers
        >>> records = load_filtered(active=1)
        
        >>> # Observers in region 'Nord'
        >>> records = load_filtered(geographic_region='Nord')
        
        >>> # Search by name
        >>> records = load_filtered(last_name='Schmidt')
    """
    if not filters:
        return load_all()
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Build WHERE clause dynamically
            where_clauses = []
            params = []
            
            # Fields that use LIKE for partial matching
            like_fields = {'first_name', 'last_name', 'primary_site', 'primary_region', 
                          'secondary_site', 'secondary_region'}
            
            for field, value in filters.items():
                if field in like_fields:
                    # Partial match with LIKE
                    where_clauses.append(f"{field} LIKE %s")
                    params.append(f"%{value}%")
                else:
                    # Exact match
                    where_clauses.append(f"{field} = %s")
                    params.append(value)
            
            where_sql = " AND ".join(where_clauses)
            
            query = f"""
                SELECT kk, active, since, first_name, last_name,
                       primary_site, primary_region, primary_longitude, primary_latitude, primary_altitude,
                       secondary_site, secondary_region, secondary_longitude, secondary_latitude, secondary_altitude,
                       geographic_region, publication_rights, institution, address, email, phone
                FROM observers
                WHERE {where_sql}
                ORDER BY kk, since
            """
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            # Convert tuples to lists of strings (match file format)
            records = []
            for row in rows:
                record = [str(value) if value is not None else "" for value in row]
                records.append(record)
            
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

def save_one(record: List[str]) -> bool:
    """
    Insert new observer record (21 fields).
    
    Args:
        record: List of 21 strings matching observer record format
        
    Returns:
        True if inserted successfully
        False if duplicate key (kk, since)
        
    Example:
        >>> record = ['44', '1', '04/26', 'Max', 'Mustermann', ...]
        >>> if save_one(record):
        ...     print("Observer record saved")
        ... else:
        ...     print("Duplicate record (kk, since)")
    """
    if len(record) != 21:
        raise ValueError(f"Observer record must have 21 fields, got {len(record)}")
    
    with get_connection() as conn:
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO observers (
                        kk, active, since, first_name, last_name,
                        primary_site, primary_region, primary_longitude, primary_latitude, primary_altitude,
                        secondary_site, secondary_region, secondary_longitude, secondary_latitude, secondary_altitude,
                        geographic_region, publication_rights, institution, address, email, phone
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s
                    )
                """, record)
                
                conn.commit()
                return True
                
        except psycopg2.IntegrityError:
            # Duplicate key (kk, since)
            conn.rollback()
            return False


def update_one(kk: int, seit: str, record: List[str]) -> bool:
    """
    Update existing observer record.
    
    Args:
        kk: Observer code
        seit: Validity date (format: MM/YY)
        record: Updated record (21 fields)
        
    Returns:
        True if updated (1 row affected)
        False if not found (0 rows affected)
        
    Example:
        >>> record = ['44', '1', '04/26', 'Max', 'Mustermann', ...]
        >>> if update_one(44, '04/26', record):
        ...     print("Observer record updated")
        ... else:
        ...     print("Record not found")
    """
    if len(record) != 21:
        raise ValueError(f"Observer record must have 21 fields, got {len(record)}")
    
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                UPDATE observers SET
                    kk=%s, active=%s, since=%s, first_name=%s, last_name=%s,
                    primary_site=%s, primary_region=%s, primary_longitude=%s, primary_latitude=%s, primary_altitude=%s,
                    secondary_site=%s, secondary_region=%s, secondary_longitude=%s, secondary_latitude=%s, secondary_altitude=%s,
                    geographic_region=%s, publication_rights=%s, institution=%s, address=%s, email=%s, phone=%s
                WHERE kk=%s AND since=%s
            """, record + [kk, seit])
            
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
