"""
Database Connection Management with Connection Pooling

Provides shared connection utilities for all database operations.
Used by observations_db.py and observers_db.py.

Author: HALOpy Team
Date: 2026-02-09
"""

from contextlib import contextmanager
from typing import Generator, Optional, Any, TYPE_CHECKING
from halo.config import get_database_url

# Type hints only - not executed at runtime
if TYPE_CHECKING:
    from psycopg2.pool import ThreadedConnectionPool  # type: ignore[import-untyped]

# Optional import - only needed for cloud mode
try:
    import psycopg2  # type: ignore[import-untyped]
    from psycopg2 import pool  # type: ignore[import-untyped]
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    psycopg2 = None  # type: ignore
    pool = None  # type: ignore


# Global connection pool (initialized on first use)
_connection_pool: Optional[Any] = None


def _get_pool() -> Any:
    """
    Get or create connection pool (lazy initialization).
    
    Pool settings optimized for small application (<10 concurrent users):
    - minconn=1: Keep at least 1 connection alive
    - maxconn=5: Maximum 5 concurrent connections
    
    Returns:
        ThreadedConnectionPool instance (if psycopg2 available)
    """
    global _connection_pool
    
    if not PSYCOPG2_AVAILABLE:
        raise ImportError("psycopg2 not installed. Required for cloud mode. Install with: pip install psycopg2-binary")
    
    if _connection_pool is None:
        database_url = get_database_url()
        
        if not database_url:
            raise ValueError("DATABASE_URL not configured. Set environment variable or check config.py")
        
        try:
            _connection_pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=database_url
            )
        except psycopg2.Error as e:
            raise psycopg2.Error(f"Failed to create connection pool: {e}")
    
    return _connection_pool


@contextmanager
def get_connection() -> Generator:
    """
    Get database connection from pool (context manager).
    
    Connection is automatically returned to pool after use (NOT closed).
    Use with 'with' statement for automatic cleanup.
    
    Yields:
        Active psycopg2 connection object
        
    Raises:
        ImportError: If psycopg2 not installed (cloud mode only)
        ValueError: If DATABASE_URL is not configured
        psycopg2.Error: If connection fails
        
    Example:
        >>> with get_connection() as conn:
        ...     cursor = conn.cursor()
        ...     cursor.execute("SELECT COUNT(*) FROM observations")
        ...     count = cursor.fetchone()[0]
        ...     cursor.close()
        # Connection automatically returned to pool here
    """
    if not PSYCOPG2_AVAILABLE:
        raise ImportError("psycopg2 not installed. Required for cloud mode. Install with: pip install psycopg2-binary")
    
    pool_instance = _get_pool()
    conn = pool_instance.getconn()
    
    try:
        yield conn
    finally:
        # Return connection to pool (not closed, can be reused)
        pool_instance.putconn(conn)


def test_connection() -> bool:
    """
    Test if database is reachable.
    
    Returns:
        True if connection successful and SELECT 1 works
        False if any error occurs
        
    Example:
        >>> if test_connection():
        ...     print("Database ready!")
        ... else:
        ...     print("Database unavailable")
    """
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            cursor.close()
            return result is not None and result[0] == 1
    except Exception:
        return False
