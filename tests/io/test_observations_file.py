"""
Test Suite for observations_file.py (Layer 3a - File Operations)

Tests all file I/O operations for observations.
These tests are storage-specific and test file operations only.

Layer 3a Functions Tested:
- File CRUD: new_file(), open_file(), save_file(), delete_file(), rename_file()
- File queries: file_exists(), list_files()
- Path utilities: get_data_path(), get_temp_path(), get_backup_path()
- Temp operations: create_temp_backup(), restore_from_temp(), clean_temp_files()
- Backup operations: create_backup(), restore_from_backup(), delete_backup()

Usage:
    python tests/io/test_observations_file.py
    python -m pytest tests/io/test_observations_file.py -v
"""

from pathlib import Path
import sys
import shutil
import time

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))

from halo.models.types import Observation
from halo.io import observations_file as file_ops


# ============================================================================
# Test Configuration
# ============================================================================

TEST_DATA_DIR = project_root / 'tests' / 'testdata' / 'observations_file'


def setup_test_dir():
    """Create test directory."""
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ Created test directory: {TEST_DATA_DIR}")


def cleanup_test_dir():
    """Remove test directory and all contents."""
    if TEST_DATA_DIR.exists():
        shutil.rmtree(TEST_DATA_DIR)
        print(f"✓ Cleaned up test directory: {TEST_DATA_DIR}")


def create_test_observation(kk=44, o=1, jj=25, mm=1, tt=15, ee=22, gg=10):
    """
    Create a test observation with given key fields.
    Identical to test_observations_layer2.py for consistency.
    """
    obs = Observation()
    obs.vers = 25
    obs.KK = kk
    obs.O = o
    obs.JJ = jj
    obs.MM = mm
    obs.TT = tt
    obs.g = 1
    obs.ZS = 12
    obs.ZM = 30
    obs.d = -1
    obs.DD = -1
    obs.N = -1
    obs.C = -1
    obs.c = -1
    obs.EE = ee
    obs.H = 5
    obs.F = 3
    obs.V = 1
    obs.f = -1
    obs.zz = -1
    obs.GG = gg
    obs.HO = -1
    obs.HU = -1
    obs.sectors = ""
    obs.remarks = "Test observation"
    obs.VName = "Test"
    obs.NName = "User"
    return obs


# ============================================================================
# Test Cases: File CRUD Operations
# ============================================================================

def test_new_file():
    """Test creating a new empty file."""
    print("\n=== Test: New File ===")
    
    test_file = "new_test.csv"
    filepath = file_ops.new_file(test_file, base_dir=TEST_DATA_DIR)
    
    assert filepath.exists(), "new_file() should create file"
    assert filepath.stat().st_size == 0, "New file should be empty"
    print(f"✓ new_file() created empty file: {filepath}")
    
    # Test duplicate creation (should fail)
    try:
        file_ops.new_file(test_file, base_dir=TEST_DATA_DIR)
        assert False, "new_file() should raise FileExistsError for existing file"
    except FileExistsError:
        print(f"✓ new_file() correctly raised FileExistsError for duplicate")
    
    # Cleanup
    filepath.unlink()


def test_open_and_save_file():
    """Test opening and saving observation files."""
    print("\n=== Test: Open and Save File ===")
    
    # Create test data
    test_file = "test_observations.csv"
    observations = [
        create_test_observation(kk=44, mm=1),
        create_test_observation(kk=45, mm=2),
        create_test_observation(kk=46, mm=3),
    ]
    
    # Save observations
    filepath = file_ops.resolve_path(test_file, TEST_DATA_DIR)
    file_ops.save_file(observations, filepath)
    
    assert filepath.exists(), "save_file() should create file"
    print(f"✓ save_file() saved {len(observations)} observations to {filepath}")
    
    # Open observations
    loaded_obs, loaded_path = file_ops.open_file(test_file, base_dir=TEST_DATA_DIR)
    
    assert len(loaded_obs) == len(observations), f"Expected {len(observations)} observations, got {len(loaded_obs)}"
    assert loaded_path == filepath, f"Expected path {filepath}, got {loaded_path}"
    print(f"✓ open_file() loaded {len(loaded_obs)} observations")
    
    # Verify data integrity
    assert loaded_obs[0].KK == 44, "First observation should be KK=44"
    assert loaded_obs[1].KK == 45, "Second observation should be KK=45"
    assert loaded_obs[2].KK == 46, "Third observation should be KK=46"
    print(f"✓ Data integrity verified (KK: 44, 45, 46)")
    
    # Cleanup
    filepath.unlink()


def test_save_with_backup():
    """Test saving file with automatic backup."""
    print("\n=== Test: Save with Backup ===")
    
    test_file = "backup_test.csv"
    filepath = file_ops.resolve_path(test_file, TEST_DATA_DIR)
    
    # Create initial file
    original_obs = [create_test_observation(kk=44, mm=1)]
    file_ops.save_file(original_obs, filepath)
    print(f"✓ Created initial file with {len(original_obs)} observation")
    
    # Save with backup
    updated_obs = [
        create_test_observation(kk=44, mm=1),
        create_test_observation(kk=45, mm=2),
    ]
    file_ops.save_file(updated_obs, filepath, create_backup=True)
    
    # Check backup was created
    backup_path = file_ops.get_backup_path(str(filepath))
    assert backup_path.exists(), "Backup file should exist"
    print(f"✓ save_file() with create_backup=True created backup: {backup_path}")
    
    # Verify backup contains original data
    backup_obs, _ = file_ops.open_file(str(backup_path))
    assert len(backup_obs) == 1, f"Backup should have 1 observation, got {len(backup_obs)}"
    print(f"✓ Backup contains original data ({len(backup_obs)} observation)")
    
    # Verify current file has updated data
    current_obs, _ = file_ops.open_file(test_file, base_dir=TEST_DATA_DIR)
    assert len(current_obs) == 2, f"Current file should have 2 observations, got {len(current_obs)}"
    print(f"✓ Current file contains updated data ({len(current_obs)} observations)")
    
    # Cleanup
    filepath.unlink()
    backup_path.unlink()


def test_delete_file():
    """Test deleting observation file."""
    print("\n=== Test: Delete File ===")
    
    test_file = "delete_test.csv"
    observations = [create_test_observation()]
    
    # Create file
    filepath = file_ops.resolve_path(test_file, TEST_DATA_DIR)
    file_ops.save_file(observations, filepath)
    assert filepath.exists(), "File should exist after save"
    print(f"✓ Created test file: {filepath}")
    
    # Delete file
    deleted = file_ops.delete_file(test_file, base_dir=TEST_DATA_DIR)
    assert deleted == True, "delete_file() should return True"
    assert not filepath.exists(), "File should not exist after delete"
    print(f"✓ delete_file() deleted file successfully")
    
    # Try to delete non-existent file
    deleted = file_ops.delete_file(test_file, base_dir=TEST_DATA_DIR)
    assert deleted == False, "delete_file() should return False for non-existent file"
    print(f"✓ delete_file() returned False for non-existent file")


def test_rename_file():
    """Test renaming observation file."""
    print("\n=== Test: Rename File ===")
    
    old_name = "old_name.csv"
    new_name = "new_name.csv"
    observations = [create_test_observation()]
    
    # Create file with old name
    old_path = file_ops.resolve_path(old_name, TEST_DATA_DIR)
    file_ops.save_file(observations, old_path)
    assert old_path.exists(), "Old file should exist"
    print(f"✓ Created file: {old_path}")
    
    # Rename file
    new_path = file_ops.rename_file(old_name, new_name, base_dir=TEST_DATA_DIR)
    
    assert not old_path.exists(), "Old file should not exist after rename"
    assert new_path.exists(), "New file should exist after rename"
    print(f"✓ rename_file() renamed {old_name} → {new_name}")
    
    # Verify data was preserved
    loaded_obs, _ = file_ops.open_file(new_name, base_dir=TEST_DATA_DIR)
    assert len(loaded_obs) == 1, "Data should be preserved after rename"
    print(f"✓ Data preserved after rename ({len(loaded_obs)} observation)")
    
    # Try to rename non-existent file
    try:
        file_ops.rename_file("nonexistent.csv", "other.csv", base_dir=TEST_DATA_DIR)
        assert False, "rename_file() should raise FileNotFoundError"
    except FileNotFoundError:
        print(f"✓ rename_file() correctly raised FileNotFoundError")
    
    # Cleanup
    new_path.unlink()


# ============================================================================
# Test Cases: File Queries
# ============================================================================

def test_file_exists():
    """Test checking if file exists."""
    print("\n=== Test: File Exists ===")
    
    test_file = "exists_test.csv"
    
    # Check non-existent file
    exists = file_ops.file_exists(test_file, base_dir=TEST_DATA_DIR)
    assert exists == False, "file_exists() should return False for non-existent file"
    print(f"✓ file_exists() returned False for non-existent file")
    
    # Create file
    filepath = file_ops.new_file(test_file, base_dir=TEST_DATA_DIR)
    
    # Check existing file
    exists = file_ops.file_exists(test_file, base_dir=TEST_DATA_DIR)
    assert exists == True, "file_exists() should return True for existing file"
    print(f"✓ file_exists() returned True for existing file")
    
    # Cleanup
    filepath.unlink()


def test_list_files():
    """Test listing observation files."""
    print("\n=== Test: List Files ===")
    
    # Create test files with different extensions
    test_files = ["test1.csv", "test2.csv", "test3.HAL", "test4.txt"]
    created_paths = []
    
    for filename in test_files:
        filepath = file_ops.new_file(filename, base_dir=TEST_DATA_DIR)
        created_paths.append(filepath)
    print(f"✓ Created {len(test_files)} test files")
    
    # List all files
    all_files = file_ops.list_files(base_dir=TEST_DATA_DIR)
    assert len(all_files) >= 4, f"Should list at least 4 files, got {len(all_files)}"
    print(f"✓ list_files() found {len(all_files)} files (all extensions)")
    
    # List CSV files only
    csv_files = file_ops.list_files(base_dir=TEST_DATA_DIR, extensions=[".csv"])
    assert len([f for f in csv_files if f.endswith('.csv')]) == 2, "Should list 2 CSV files"
    print(f"✓ list_files(extensions=['.csv']) found {len(csv_files)} CSV files")
    
    # List HAL files only
    hal_files = file_ops.list_files(base_dir=TEST_DATA_DIR, extensions=[".HAL"])
    assert len([f for f in hal_files if f.endswith('.HAL')]) == 1, "Should list 1 HAL file"
    print(f"✓ list_files(extensions=['.HAL']) found {len(hal_files)} HAL files")
    
    # Cleanup
    for filepath in created_paths:
        filepath.unlink()


# ============================================================================
# Test Cases: Path Utilities
# ============================================================================

def test_path_utilities():
    """Test path utility functions."""
    print("\n=== Test: Path Utilities ===")
    
    # get_data_path
    data_dir = file_ops.get_data_path()
    assert data_dir == Path("data"), f"Expected 'data', got '{data_dir}'"
    print(f"✓ get_data_path() → {data_dir}")
    
    data_file = file_ops.get_data_path("test.csv")
    assert data_file == Path("data/test.csv"), f"Expected 'data/test.csv', got '{data_file}'"
    print(f"✓ get_data_path('test.csv') → {data_file}")
    
    # get_temp_path
    temp_path = file_ops.get_temp_path("test.csv")
    assert str(temp_path).endswith("test.$$$"), f"Expected '*.test.$$$', got '{temp_path}'"
    print(f"✓ get_temp_path('test.csv') → {temp_path}")
    
    # get_backup_path
    backup_path = file_ops.get_backup_path("test.csv")
    assert str(backup_path).endswith("test.bak"), f"Expected '*.test.bak', got '{backup_path}'"
    print(f"✓ get_backup_path('test.csv') → {backup_path}")


# ============================================================================
# Test Cases: Temp Operations
# ============================================================================

def test_temp_backup_operations():
    """Test temporary backup operations."""
    print("\n=== Test: Temp Backup Operations ===")
    
    test_file = "temp_test.csv"
    observations = [
        create_test_observation(kk=44),
        create_test_observation(kk=45),
    ]
    
    # Create temp backup
    temp_path = file_ops.create_temp_backup(observations, str(TEST_DATA_DIR / test_file))
    
    assert temp_path.exists(), "Temp backup should exist"
    assert str(temp_path).endswith(".$$$"), "Temp backup should have $$$ extension"
    print(f"✓ create_temp_backup() created: {temp_path}")
    
    # Restore from temp
    restored_obs = file_ops.restore_from_temp(str(TEST_DATA_DIR / test_file))
    
    assert restored_obs is not None, "restore_from_temp() should return observations"
    assert len(restored_obs) == 2, f"Expected 2 observations, got {len(restored_obs)}"
    print(f"✓ restore_from_temp() restored {len(restored_obs)} observations")
    
    # Delete temp file
    deleted = file_ops.delete_temp_file(str(TEST_DATA_DIR / test_file))
    assert deleted == True, "delete_temp_file() should return True"
    assert not temp_path.exists(), "Temp file should not exist after delete"
    print(f"✓ delete_temp_file() deleted temp file")
    
    # Try to restore non-existent temp file
    restored_obs = file_ops.restore_from_temp(str(TEST_DATA_DIR / test_file))
    assert restored_obs is None, "restore_from_temp() should return None for non-existent file"
    print(f"✓ restore_from_temp() returned None for non-existent file")


def test_clean_temp_files():
    """Test cleaning old temp files."""
    print("\n=== Test: Clean Temp Files ===")
    
    # Create temp files
    temp_files = []
    for i in range(3):
        temp_path = TEST_DATA_DIR / f"temp{i}.$$$"
        temp_path.write_text(f"temp data {i}", encoding="utf-8")
        temp_files.append(temp_path)
    print(f"✓ Created {len(temp_files)} temp files")
    
    # Make one file older (simulate)
    old_file = temp_files[0]
    old_time = time.time() - (25 * 3600)  # 25 hours ago
    import os
    os.utime(old_file, (old_time, old_time))
    print(f"✓ Made {old_file.name} appear 25 hours old")
    
    # Clean temp files older than 24 hours
    deleted_count = file_ops.clean_temp_files(base_dir=TEST_DATA_DIR, max_age_hours=24)
    
    assert deleted_count == 1, f"Expected 1 file deleted, got {deleted_count}"
    assert not old_file.exists(), "Old temp file should be deleted"
    print(f"✓ clean_temp_files() deleted {deleted_count} old file")
    
    # Cleanup remaining temp files
    for temp_file in temp_files[1:]:
        if temp_file.exists():
            temp_file.unlink()


# ============================================================================
# Test Cases: Backup Operations
# ============================================================================

def test_backup_operations():
    """Test backup operations."""
    print("\n=== Test: Backup Operations ===")
    
    test_file = "backup_ops_test.csv"
    observations = [
        create_test_observation(kk=44),
        create_test_observation(kk=45),
        create_test_observation(kk=46),
    ]
    
    # Create original file
    filepath = file_ops.resolve_path(test_file, TEST_DATA_DIR)
    file_ops.save_file(observations, filepath)
    print(f"✓ Created original file with {len(observations)} observations")
    
    # Create backup
    backup_path = file_ops.create_backup(test_file, base_dir=TEST_DATA_DIR)
    
    assert backup_path is not None, "create_backup() should return path"
    assert backup_path.exists(), "Backup file should exist"
    assert str(backup_path).endswith(".bak"), "Backup should have .bak extension"
    print(f"✓ create_backup() created: {backup_path}")
    
    # Modify original file
    modified_obs = [create_test_observation(kk=99)]
    file_ops.save_file(modified_obs, filepath)
    print(f"✓ Modified original file (now has {len(modified_obs)} observation)")
    
    # Restore from backup
    restored_obs = file_ops.restore_from_backup(test_file, base_dir=TEST_DATA_DIR)
    
    assert restored_obs is not None, "restore_from_backup() should return observations"
    assert len(restored_obs) == 3, f"Expected 3 observations from backup, got {len(restored_obs)}"
    print(f"✓ restore_from_backup() restored {len(restored_obs)} observations")
    
    # Delete backup
    deleted = file_ops.delete_backup(test_file, base_dir=TEST_DATA_DIR)
    assert deleted == True, "delete_backup() should return True"
    assert not backup_path.exists(), "Backup file should not exist after delete"
    print(f"✓ delete_backup() deleted backup file")
    
    # Cleanup
    filepath.unlink()


# ============================================================================
# Main Test Runner
# ============================================================================

def run_all_tests():
    """Run all Layer 3a tests."""
    print("=" * 70)
    print("Testing observations_file.py (Layer 3a - File Operations)")
    print("=" * 70)
    print("\nThese tests are storage-specific and test file I/O operations.")
    print()
    
    # Setup
    print("--- Setup ---")
    setup_test_dir()
    
    tests = [
        ("New File", test_new_file),
        ("Open and Save File", test_open_and_save_file),
        ("Save with Backup", test_save_with_backup),
        ("Delete File", test_delete_file),
        ("Rename File", test_rename_file),
        ("File Exists", test_file_exists),
        ("List Files", test_list_files),
        ("Path Utilities", test_path_utilities),
        ("Temp Backup Operations", test_temp_backup_operations),
        ("Clean Temp Files", test_clean_temp_files),
        ("Backup Operations", test_backup_operations),
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
    cleanup_test_dir()
    
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
