#!/usr/bin/env python3
"""
Import CSV observations to PostgreSQL database.

CRITICAL: Uses _observation_to_tuple() function to ensure correct field mapping
between Python Observation objects and PostgreSQL columns.

Usage:
    python scripts/import_csv_to_db.py data/1986-2025.csv
"""

import sys
import os
from pathlib import Path

# Add project root to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
import psycopg2
from halo.io.csv_handler import ObservationCSV
from halo.io.observations_db import _observation_to_tuple

load_dotenv()


def import_csv_to_db(csv_path: str) -> None:
    """
    Import CSV file to PostgreSQL database.
    
    Uses the same field mapping as the application (_observation_to_tuple)
    to ensure data consistency between CSV import and runtime operations.
    
    Args:
        csv_path: Path to CSV file to import
        
    Raises:
        ValueError: If DATABASE_URL not set
        FileNotFoundError: If CSV file doesn't exist
    """
    # Check DATABASE_URL
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        raise ValueError("DATABASE_URL not set in environment. Create .env file with DATABASE_URL=postgresql://...")
    
    # Check CSV file exists
    csv_file = Path(csv_path)
    if not csv_file.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")
    
    print(f"📁 Reading CSV file: {csv_path}")
    
    # Load CSV using HALOpy's CSV handler
    csv_handler = ObservationCSV(csv_path)
    observations = csv_handler.read()
    print(f"✅ Loaded {len(observations)} observations from CSV")
    
    if not observations:
        print("⚠️  No observations to import")
        return
    
    # Connect to PostgreSQL
    print(f"🗄️  Connecting to database...")
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        print(f"✅ Database connection successful")
    except psycopg2.Error as e:
        print(f"❌ Database connection failed: {e}")
        return
    
    # Import observations with correct field mapping
    print(f"📥 Importing observations...")
    inserted = 0
    skipped = 0
    
    for i, obs in enumerate(observations):
        try:
            # Use _observation_to_tuple to get values in correct PostgreSQL column order
            # This ensures same mapping as used by the application at runtime
            values = _observation_to_tuple(obs)
            
            cursor.execute("""
                INSERT INTO observations (
                    kk, o, jj, mm, tt, g,
                    zs, zm, d, dd, n, c, cc,
                    ee, h, f, v, ff, zz, gg,
                    pillar, sectors, remarks
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (kk, o, jj, mm, tt, g, zs, zm, ee, gg) DO NOTHING
            """, values)
            
            if cursor.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
                
            # Progress indicator every 1000 records
            if (i + 1) % 1000 == 0:
                print(f"  📊 Processed {i + 1}/{len(observations)} observations...")
                
        except psycopg2.Error as e:
            print(f"❌ Error importing observation {i + 1}: {e}")
            print(f"   Observation data: KK={obs.KK}, JJ={obs.JJ}, MM={obs.MM}, TT={obs.TT}")
            conn.rollback()
            cursor.close()
            conn.close()
            return
    
    # Commit all changes
    conn.commit()
    cursor.close()
    conn.close()
    
    print(f"🎉 Import completed successfully!")
    print(f"   📊 {inserted} observations imported")
    print(f"   ⏭️  {skipped} observations skipped (duplicates)")
    print(f"   📈 Total processed: {len(observations)}")


def main():
    """Command line entry point."""
    if len(sys.argv) != 2:
        print("Usage: python scripts/import_csv_to_db.py <csv_file>")
        print("")
        print("Examples:")
        print("  python scripts/import_csv_to_db.py data/1986-2025.csv")
        print("  python scripts/import_csv_to_db.py /tmp/observations.csv")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    
    try:
        import_csv_to_db(csv_path)
    except (ValueError, FileNotFoundError) as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️  Import cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()