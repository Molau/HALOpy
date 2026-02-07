"""
Test Suite for observers.py (Observer File I/O Operations)

Tests all observer-related file operations including CRUD operations
and observer site management.

Functions Tested:
- load_observers(): Load observer records from halobeo.csv
- save_observers(): Save observer records to halobeo.csv
- find_observer_records(): Find all records for a specific observer
- add_observer_record(): Add new observer record
- update_observer_record(): Update existing observer record
- delete_observer_record(): Delete observer record

Usage:
    python tests/io/test_observers.py
    python -m pytest tests/io/test_observers.py -v
"""

from pathlib import Path
import sys
import shutil
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))

from halo.models.types import Observer
from halo.io import observers


# ============================================================================
# Test Configuration
# ============================================================================

TEST_DATA_DIR = project_root / 'tests' / 'testdata'
TEST_FILE = TEST_DATA_DIR / 'test_halobeo.csv'
BACKUP_FILE = TEST_DATA_DIR / 'test_halobeo_backup.csv'


def setup_test_file():
    """Create test directory and copy production file for testing."""
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Copy production file as test file
    production_file = project_root / 'data' / 'halobeo.csv'
    if production_file.exists():
        shutil.copy(production_file, TEST_FILE)
        print(f"✓ Created test file: {TEST_FILE}")
    else:
        print(f"⚠ Warning: Production file not found: {production_file}")
        print(f"  Creating empty test file...")
        TEST_FILE.write_text("", encoding='utf-8')


def cleanup_test_file():
    """Remove test file after tests."""
    if TEST_FILE.exists():
        TEST_FILE.unlink()
        print(f"✓ Cleaned up test file: {TEST_FILE}")


def create_test_observer(kk=99, seit="01/26"):
    """Create a test observer record."""
    obs = Observer()
    obs.KK = kk
    obs.seit = seit
    obs.VName = "Test"
    obs.NName = "Observer"
    obs.Land = "AT"
    obs.Gebiet = "AT-N"
    obs.Plz = "1234"
    obs.Ort = "Teststadt"
    obs.Lon = "13.0"
    obs.Lat = "48.0"
    obs.Hoehe = "500"
    obs.aktiv = "y"
    return obs


# ============================================================================
# Test Cases
# ============================================================================

def test_load_observers():
    """Test loading observers from file."""
    print("\n=== Test: Load Observers ===")
    
    observers_list = observers.load_observers(TEST_FILE)
    
    assert len(observers_list) > 0, "Should load at least one observer"
    print(f"✓ load_observers() loaded {len(observers_list)} observer records")
    
    # Check first observer structure
    first = observers_list[0]
    assert hasattr(first, 'KK'), "Observer should have KK field"
    assert hasattr(first, 'seit'), "Observer should have seit field"
    assert hasattr(first, 'VName'), "Observer should have VName field"
    print(f"✓ First observer: KK={first.KK}, seit={first.seit}, {first.VName} {first.NName}")
    
    return observers_list


def test_find_observer_records():
    """Test finding observer records."""
    print("\n=== Test: Find Observer Records ===")
    
    observers_list = observers.load_observers(TEST_FILE)
    
    # Find records for first observer
    first_kk = observers_list[0].KK
    records = observers.find_observer_records(observers_list, first_kk)
    
    assert len(records) > 0, f"Should find at least one record for KK={first_kk}"
    print(f"✓ find_observer_records(KK={first_kk}) found {len(records)} record(s)")
    
    for rec in records:
        print(f"  - seit={rec.seit}, {rec.VName} {rec.NName}, {rec.Ort}")
    
    # Test non-existent observer
    non_existent = observers.find_observer_records(observers_list, 999)
    assert len(non_existent) == 0, "Should return empty list for non-existent observer"
    print(f"✓ find_observer_records(KK=999) -> empty list")


def test_add_observer_record():
    """Test adding a new observer record."""
    print("\n=== Test: Add Observer Record ===")
    
    observers_list = observers.load_observers(TEST_FILE)
    initial_count = len(observers_list)
    
    # Create new test observer
    new_obs = create_test_observer(kk=99, seit="01/26")
    
    # Add observer
    success, observers_list = observers.add_observer_record(new_obs, observers_list)
    
    assert success == True, "add_observer_record() should succeed"
    assert len(observers_list) == initial_count + 1, f"Expected {initial_count + 1} observers, got {len(observers_list)}"
    print(f"✓ add_observer_record() added KK={new_obs.KK}, seit={new_obs.seit}")
    print(f"  Total observers: {initial_count} → {len(observers_list)}")
    
    # Verify it was added and sorted correctly
    found = observers.find_observer_records(observers_list, 99)
    assert len(found) > 0, "Should find newly added observer"
    print(f"✓ Verified: KK=99 found in collection")
    
    return observers_list


def test_update_observer_record():
    """Test updating an existing observer record."""
    print("\n=== Test: Update Observer Record ===")
    
    observers_list = observers.load_observers(TEST_FILE)
    
    # Add test observer first
    test_obs = create_test_observer(kk=99, seit="01/26")
    success, observers_list = observers.add_observer_record(test_obs, observers_list)
    assert success, "Setup: add_observer_record() should succeed"
    
    # Update observer
    updated_obs = create_test_observer(kk=99, seit="01/26")
    updated_obs.VName = "Updated"
    updated_obs.NName = "Name"
    updated_obs.Ort = "New City"
    
    success, observers_list = observers.update_observer_record(99, "01/26", updated_obs, observers_list)
    
    assert success == True, "update_observer_record() should succeed"
    print(f"✓ update_observer_record(KK=99, seit=01/26) succeeded")
    
    # Verify update
    found = observers.find_observer_records(observers_list, 99)
    assert len(found) > 0, "Should find updated observer"
    assert found[0].VName == "Updated", f"Expected VName='Updated', got '{found[0].VName}'"
    assert found[0].Ort == "New City", f"Expected Ort='New City', got '{found[0].Ort}'"
    print(f"✓ Verified: {found[0].VName} {found[0].NName}, {found[0].Ort}")
    
    # Try to update non-existent record
    success, observers_list = observers.update_observer_record(999, "99/99", updated_obs, observers_list)
    assert success == False, "update_observer_record() should fail for non-existent record"
    print(f"✓ update_observer_record() correctly failed for non-existent record")
    
    return observers_list


def test_delete_observer_record():
    """Test deleting an observer record."""
    print("\n=== Test: Delete Observer Record ===")
    
    observers_list = observers.load_observers(TEST_FILE)
    
    # Add test observer first
    test_obs = create_test_observer(kk=99, seit="01/26")
    success, observers_list = observers.add_observer_record(test_obs, observers_list)
    assert success, "Setup: add_observer_record() should succeed"
    
    initial_count = len(observers_list)
    
    # Delete observer
    success, observers_list = observers.delete_observer_record(99, "01/26", observers_list)
    
    assert success == True, "delete_observer_record() should succeed"
    assert len(observers_list) == initial_count - 1, f"Expected {initial_count - 1} observers, got {len(observers_list)}"
    print(f"✓ delete_observer_record(KK=99, seit=01/26) succeeded")
    print(f"  Total observers: {initial_count} → {len(observers_list)}")
    
    # Verify deletion
    found = observers.find_observer_records(observers_list, 99)
    assert len(found) == 0, "Deleted observer should not be found"
    print(f"✓ Verified: KK=99 not found in collection")
    
    # Try to delete non-existent record
    success, observers_list = observers.delete_observer_record(999, "99/99", observers_list)
    assert success == False, "delete_observer_record() should fail for non-existent record"
    print(f"✓ delete_observer_record() correctly failed for non-existent record")
    
    return observers_list


def test_save_observers():
    """Test saving observers to file."""
    print("\n=== Test: Save Observers ===")
    
    observers_list = observers.load_observers(TEST_FILE)
    
    # Add test observer
    test_obs = create_test_observer(kk=99, seit="01/26")
    success, observers_list = observers.add_observer_record(test_obs, observers_list)
    assert success, "Setup: add_observer_record() should succeed"
    
    # Save to file
    observers.save_observers(observers_list, TEST_FILE)
    print(f"✓ save_observers() saved {len(observers_list)} records to {TEST_FILE}")
    
    # Reload and verify
    reloaded = observers.load_observers(TEST_FILE)
    assert len(reloaded) == len(observers_list), f"Expected {len(observers_list)} records, got {len(reloaded)}"
    print(f"✓ Verified: reloaded {len(reloaded)} records")
    
    # Verify test observer is still there
    found = observers.find_observer_records(reloaded, 99)
    assert len(found) > 0, "Test observer should exist after save/reload"
    print(f"✓ Verified: test observer KK=99 persisted correctly")


def test_sorting():
    """Test that observers are sorted correctly."""
    print("\n=== Test: Observer Sorting ===")
    
    # Create observers in wrong order
    obs_list = []
    
    obs1 = create_test_observer(kk=50, seit="06/25")  # Middle KK, later date
    obs2 = create_test_observer(kk=30, seit="01/20")  # Earlier KK
    obs3 = create_test_observer(kk=50, seit="01/20")  # Same KK as obs1, earlier date
    
    # Add in wrong order
    success, obs_list = observers.add_observer_record(obs1, obs_list)
    success, obs_list = observers.add_observer_record(obs2, obs_list)
    success, obs_list = observers.add_observer_record(obs3, obs_list)
    
    # Check sorting: Should be KK=30, then KK=50 (01/20), then KK=50 (06/25)
    assert obs_list[0].KK == 30, f"First should be KK=30, got KK={obs_list[0].KK}"
    assert obs_list[1].KK == 50 and obs_list[1].seit == "01/20", f"Second should be KK=50 seit=01/20, got KK={obs_list[1].KK} seit={obs_list[1].seit}"
    assert obs_list[2].KK == 50 and obs_list[2].seit == "06/25", f"Third should be KK=50 seit=06/25, got KK={obs_list[2].KK} seit={obs_list[2].seit}"
    
    print(f"✓ Observer sorting correct:")
    for i, obs in enumerate(obs_list):
        print(f"  {i+1}. KK={obs.KK}, seit={obs.seit}")


# ============================================================================
# Main Test Runner
# ============================================================================

def run_all_tests():
    """Run all observer I/O tests."""
    print("=" * 70)
    print("Testing observers.py (Observer File I/O Operations)")
    print("=" * 70)
    
    # Setup
    print("\n--- Setup ---")
    setup_test_file()
    
    tests = [
        ("Load Observers", test_load_observers),
        ("Find Observer Records", test_find_observer_records),
        ("Add Observer Record", test_add_observer_record),
        ("Update Observer Record", test_update_observer_record),
        ("Delete Observer Record", test_delete_observer_record),
        ("Save Observers", test_save_observers),
        ("Observer Sorting", test_sorting),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            test_func()
        except AssertionError as e:
            print(f"\n✗ TEST FAILED: {test_name}")
            print(f"  Error: {e}")
            failed_tests.append(test_name)
        except Exception as e:
            print(f"\n✗ ERROR in {test_name}: {e}")
            import traceback
            traceback.print_exc()
            failed_tests.append(test_name)
    
    # Cleanup
    print("\n--- Cleanup ---")
    cleanup_test_file()
    
    print("\n" + "=" * 70)
    if not failed_tests:
        print("✓ ALL TESTS PASSED!")
        print(f"  {len(tests)} test groups completed successfully")
    else:
        print(f"✗ {len(failed_tests)} TEST(S) FAILED:")
        for test_name in failed_tests:
            print(f"  - {test_name}")
    print("=" * 70)
    
    return len(failed_tests) == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
