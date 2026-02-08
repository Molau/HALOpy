#!/usr/bin/env python3
"""Test PostgreSQL database connection using DATABASE_URL from .env file."""

import os
import sys
from dotenv import load_dotenv

# Load .env file
load_dotenv()

def test_connection():
    """Test database connection."""
    db_url = os.getenv('DATABASE_URL')
    
    if not db_url:
        print("✗ ERROR: DATABASE_URL not set in .env file")
        print("  Please create .env file with DATABASE_URL variable")
        return False
    
    # Hide password in output
    display_url = db_url.split('@')[1] if '@' in db_url else db_url
    print(f"Testing connection to: {display_url}")
    
    try:
        import psycopg2
    except ImportError:
        print("✗ ERROR: psycopg2 not installed")
        print("  Run: pip install psycopg2-binary")
        return False
    
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        cursor.execute("SELECT version();")
        version = cursor.fetchone()
        print(f"✓ PostgreSQL connected successfully!")
        print(f"  Version: {version[0]}")
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return False

if __name__ == '__main__':
    success = test_connection()
    sys.exit(0 if success else 1)
