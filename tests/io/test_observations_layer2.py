"""
Test Suite for observations.py (Layer 2 - Data Management)

Tests all storage-agnostic functions with in-memory collections.
These tests are 100% reusable for both File (Layer 3a) and Database (Layer 3b)
implementations, as they contain no I/O dependencies.

Layer 2 Functions Tested:
- Key Management: make_observation_key(), find_observation(), find_observation_index()
- CRUD: add_observation(), update_observation(), delete_observation()
- Collections: sort_observations(), merge_observations(), remove_duplicates()
- Filtering: filter_observations() with flexible **kwargs
- Statistics: count_observations(), get_date_range(), get_observers()
- Validation: validate_observation(), validate_collection()
- Format Conversion: convert_legacy_observation(), convert_all_legacy_format()

Usage:
    python tests/io/test_observations_layer2.py
    python -m pytest tests/io/test_observations_layer2.py -v
"""

from pathlib import Path
import sys

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))

from halo.io.observations import (
    # Key management
    make_observation_key,
    observation_matches_key,
    find_observation,
    find_observation_index,
    # Single observation operations
    add_observation,
    update_observation,
    delete_observation,
    # Collection operations
    sort_observations,
    merge_observations,
    find_duplicates,
    remove_duplicates,
    # Filtering
    filter_observations,
    count_observations,
    get_date_range,
    get_observers,
    # Format conversion
    needs_conversion,
    convert_legacy_observation,
    convert_all_legacy_format,
    # Validation
    validate_observation,
    validate_collection
)


# ============================================================================
# Test Utilities
# ============================================================================

def create_test_observation(kk=44, o=1, jj=25, mm=1, tt=15, ee=22, gg=10):
    """
    Create a test observation dict with given key fields.
    
    This is the standard test data factory used across all Layer 2 tests.
    Default values create a valid observation for observer KK=44.
    
    Args:
        kk: Observer code (1-99)
        o: Site number (1-9)
        jj: Year (2-digit)
        mm: Month (1-12)
        tt: Day (1-31)
        ee: Halo type (22, 23, 24, etc.)
        gg: Time in hours (0-23)
    
    Returns:
        Dict[str, str] with specified key fields and valid default values
    """
    return {
        'KK': str(kk),
        'O': str(o),
        'JJ': str(jj),
        'MM': str(mm),
        'TT': str(tt),
        'g': '1',       # Morning
        'ZS': '12',
        'ZM': '30',
        'd': '',         # Not observed
        'DD': '',
        'N': '',
        'C': '',
        'c': '',
        'EE': str(ee),
        'H': '5',
        'F': '3',
        'V': '1',       # Incomplete halo
        'f': '',
        'zz': '',
        'GG': str(gg),
        'HO': '',
        'HU': '',
        'sectors': '',
        'remarks': 'Test observation',
    }


# ============================================================================
# Test Cases: Key Management
# ============================================================================

def test_key_management():
    """Test observation key creation and matching."""
    print("\n=== Test: Key Management ===")
    
    obs = create_test_observation()
    key = make_observation_key(obs)
    
    print(f"✓ make_observation_key() -> {key}")
    assert key == (44, 1, 25, 1, 15, 12, 30, 22, 10), f"Expected (44, 1, 25, 1, 15, 12, 30, 22, 10), got {key}"
    
    assert observation_matches_key(obs, key) == True
    print(f"✓ observation_matches_key() -> True")
    
    # Test with wrong key
    wrong_key = (99, 1, 25, 1, 15, 12, 30, 22, 10)
    assert observation_matches_key(obs, wrong_key) == False
    print(f"✓ observation_matches_key() with wrong key -> False")


def test_find_operations():
    """Test finding observations in collections."""
    print("\n=== Test: Find Operations ===")
    
    collection = [
        create_test_observation(kk=44, ee=22),
        create_test_observation(kk=45, ee=23),
        create_test_observation(kk=46, ee=24),
    ]
    
    # Find existing observation
    key = make_observation_key(collection[1])
    found = find_observation(collection, key)
    
    assert found is not None, "find_observation() should find existing observation"
    assert found['KK'] == '45', f"Expected KK='45', got {found['KK']}"
    print(f"✓ find_observation() found KK={found['KK']}")
    
    # Find by index
    idx = find_observation_index(collection, key)
    assert idx == 1, f"Expected index 1, got {idx}"
    print(f"✓ find_observation_index() -> {idx}")
    
    # Test not found
    not_found_key = (99, 1, 25, 1, 15, 12, 30, 22, 10)
    not_found = find_observation(collection, not_found_key)
    assert not_found is None, "find_observation() should return None for non-existent key"
    print(f"✓ find_observation() not found -> None")
    
    # Test index not found
    idx_not_found = find_observation_index(collection, not_found_key)
    assert idx_not_found == -1, f"Expected -1, got {idx_not_found}"
    print(f"✓ find_observation_index() not found -> -1")


# ============================================================================
# Test Cases: CRUD Operations
# ============================================================================

def test_add_observation():
    """Test adding observations to collections."""
    print("\n=== Test: Add Observation ===")
    
    collection = [create_test_observation(kk=44)]
    
    # Add new observation
    new_obs = create_test_observation(kk=45)
    success, collection = add_observation(new_obs, collection)
    
    assert success == True, "add_observation() should succeed for new observation"
    assert len(collection) == 2, f"Expected 2 observations, got {len(collection)}"
    print(f"✓ add_observation() success -> {len(collection)} observations")
    
    # Try to add duplicate (should fail)
    duplicate = create_test_observation(kk=45)
    success, collection = add_observation(duplicate, collection, allow_duplicates=False)
    
    assert success == False, "add_observation() should reject duplicate when allow_duplicates=False"
    assert len(collection) == 2, f"Expected 2 observations (unchanged), got {len(collection)}"
    print(f"✓ add_observation() rejected duplicate -> still {len(collection)} observations")
    
    # Add duplicate with allow_duplicates=True
    success, collection = add_observation(duplicate, collection, allow_duplicates=True)
    
    assert success == True, "add_observation() should accept duplicate when allow_duplicates=True"
    assert len(collection) == 3, f"Expected 3 observations, got {len(collection)}"
    print(f"✓ add_observation() with allow_duplicates=True -> {len(collection)} observations")


def test_update_observation():
    """Test updating observations in collections."""
    print("\n=== Test: Update Observation ===")
    
    obs1 = create_test_observation(kk=44)
    obs1['remarks'] = "Original"
    collection = [obs1]
    
    key = make_observation_key(obs1)
    
    # Update observation
    updated = create_test_observation(kk=44)
    updated['remarks'] = "Updated"
    
    success, collection = update_observation(key, updated, collection)
    
    assert success == True, "update_observation() should succeed for existing key"
    assert collection[0]['remarks'] == "Updated", f"Expected 'Updated', got '{collection[0]['remarks']}'"
    print(f"✓ update_observation() success -> remarks='{collection[0]['remarks']}'")
    
    # Try to update non-existent observation
    wrong_key = (99, 1, 25, 1, 15, 12, 30, 22, 10)
    success, collection = update_observation(wrong_key, updated, collection)
    
    assert success == False, "update_observation() should fail for non-existent key"
    print(f"✓ update_observation() with wrong key -> False")


def test_delete_observation():
    """Test deleting observations from collections."""
    print("\n=== Test: Delete Observation ===")
    
    collection = [
        create_test_observation(kk=44),
        create_test_observation(kk=45),
        create_test_observation(kk=46),
    ]
    
    # Delete middle observation
    key = make_observation_key(collection[1])
    success, collection = delete_observation(key, collection)
    
    assert success == True, "delete_observation() should succeed for existing key"
    assert len(collection) == 2, f"Expected 2 observations, got {len(collection)}"
    assert collection[0]['KK'] == '44', f"First observation should be KK=44, got {collection[0]['KK']}"
    assert collection[1]['KK'] == '46', f"Second observation should be KK=46, got {collection[1]['KK']}"
    print(f"✓ delete_observation() success -> {len(collection)} observations remaining")
    
    # Try to delete non-existent observation
    wrong_key = (99, 1, 25, 1, 15, 12, 30, 22, 10)
    success, collection = delete_observation(wrong_key, collection)
    
    assert success == False, "delete_observation() should fail for non-existent key"
    assert len(collection) == 2, f"Expected 2 observations (unchanged), got {len(collection)}"
    print(f"✓ delete_observation() with wrong key -> False, still {len(collection)} observations")


# ============================================================================
# Test Cases: Collection Operations
# ============================================================================

def test_sort_observations():
    """Test sorting observations by HALO standard."""
    print("\n=== Test: Sort Observations ===")
    
    # Create unsorted collection
    collection = [
        create_test_observation(jj=25, mm=3, tt=15, ee=22, gg=14),  # 2025-03-15 14:00 EE=22
        create_test_observation(jj=24, mm=12, tt=1, ee=23, gg=10),  # 2024-12-01 10:00 EE=23
        create_test_observation(jj=25, mm=1, tt=1, ee=22, gg=8),    # 2025-01-01 08:00 EE=22
        create_test_observation(jj=25, mm=1, tt=1, ee=22, gg=12),   # 2025-01-01 12:00 EE=22 (later time)
    ]
    
    sorted_col = sort_observations(collection)
    
    # HALO sort order: J → M → T → ZS → ZM → K → E → GG
    # Expected: 2024-12-01, 2025-01-01 (08:00), 2025-01-01 (12:00), 2025-03-15
    assert sorted_col[0]['JJ'] == '24' and sorted_col[0]['MM'] == '12', "First should be 2024-12"
    assert sorted_col[1]['JJ'] == '25' and sorted_col[1]['MM'] == '1' and sorted_col[1]['GG'] == '8', "Second should be 2025-01 08:00"
    assert sorted_col[2]['JJ'] == '25' and sorted_col[2]['MM'] == '1' and sorted_col[2]['GG'] == '12', "Third should be 2025-01 12:00"
    assert sorted_col[3]['JJ'] == '25' and sorted_col[3]['MM'] == '3', "Fourth should be 2025-03"
    
    print(f"✓ sort_observations() sorted correctly by HALO standard")
    for i, obs in enumerate(sorted_col):
        print(f"  {i+1}. 20{obs['JJ']}-{int(obs['MM']):02d}-{int(obs['TT']):02d} {int(obs['GG']):02d}:00 EE={obs['EE']}")


def test_merge_observations():
    """Test merging observation collections."""
    print("\n=== Test: Merge Observations ===")
    
    current = [
        create_test_observation(kk=44),
        create_test_observation(kk=45),
    ]
    
    new = [
        create_test_observation(kk=45),  # Duplicate
        create_test_observation(kk=46),  # New
        create_test_observation(kk=47),  # New
    ]
    
    # Merge with skip_duplicates=True
    added, merged = merge_observations(current, new, skip_duplicates=True)
    
    assert added == 2, f"Expected 2 added, got {added}"
    assert len(merged) == 4, f"Expected 4 total (2 original + 2 new), got {len(merged)}"
    print(f"✓ merge_observations() with skip_duplicates -> added {added}, total {len(merged)}")
    
    # Merge without skipping duplicates
    added, merged = merge_observations(current, new, skip_duplicates=False)
    
    assert added == 3, f"Expected 3 added, got {added}"
    assert len(merged) == 5, f"Expected 5 total (2 original + 3 new), got {len(merged)}"
    print(f"✓ merge_observations() without skip_duplicates -> added {added}, total {len(merged)}")


def test_duplicates():
    """Test duplicate detection and removal."""
    print("\n=== Test: Duplicates ===")
    
    obs = create_test_observation(kk=44)
    collection = [
        obs,  # First
        obs,  # Duplicate
        create_test_observation(kk=45),  # Different
        obs,  # Duplicate
    ]
    
    # Find duplicates
    duplicates = find_duplicates(collection)
    
    assert len(duplicates) == 2, f"Expected 2 duplicate pairs, got {len(duplicates)}"
    print(f"✓ find_duplicates() found {len(duplicates)} duplicate pairs")
    for idx1, idx2, key in duplicates:
        print(f"  Duplicate: index {idx1} and {idx2}, key={key}")
    
    # Remove duplicates (keep first)
    removed, unique = remove_duplicates(collection, keep='first')
    
    assert removed == 2, f"Expected 2 removed, got {removed}"
    assert len(unique) == 2, f"Expected 2 unique, got {len(unique)}"
    assert unique[0]['KK'] == '44', "First unique should be KK=44"
    assert unique[1]['KK'] == '45', "Second unique should be KK=45"
    print(f"✓ remove_duplicates(keep='first') removed {removed}, {len(unique)} unique remaining")
    
    # Remove duplicates (keep last)
    removed, unique = remove_duplicates(collection, keep='last')
    
    assert removed == 2, f"Expected 2 removed, got {removed}"
    assert len(unique) == 2, f"Expected 2 unique, got {len(unique)}"
    print(f"✓ remove_duplicates(keep='last') removed {removed}, {len(unique)} unique remaining")


# ============================================================================
# Test Cases: Filtering and Statistics
# ============================================================================

def test_filter_observations():
    """Test filtering observations with various criteria."""
    print("\n=== Test: Filter Observations ===")
    
    collection = [
        create_test_observation(kk=44, jj=24, mm=1, ee=22),
        create_test_observation(kk=45, jj=24, mm=6, ee=23),
        create_test_observation(kk=44, jj=25, mm=1, ee=22),
        create_test_observation(kk=46, jj=25, mm=12, ee=24),
    ]
    
    # Filter by observer
    filtered = filter_observations(collection, observer_kk=44)
    assert len(filtered) == 2, f"Expected 2 observations for KK=44, got {len(filtered)}"
    print(f"✓ filter by observer_kk=44 -> {len(filtered)} observations")
    
    # Filter by year
    filtered = filter_observations(collection, year=2024)
    assert len(filtered) == 2, f"Expected 2 observations for year 2024, got {len(filtered)}"
    print(f"✓ filter by year=2024 -> {len(filtered)} observations")
    
    # Filter by year range
    filtered = filter_observations(collection, year=(2024, 2025))
    assert len(filtered) == 4, f"Expected 4 observations for year range, got {len(filtered)}"
    print(f"✓ filter by year range (2024, 2025) -> {len(filtered)} observations")
    
    # Filter by multiple criteria
    filtered = filter_observations(collection, observer_kk=44, year=2025)
    assert len(filtered) == 1, f"Expected 1 observation for KK=44 AND year=2025, got {len(filtered)}"
    print(f"✓ filter by observer_kk=44 AND year=2025 -> {len(filtered)} observation")
    
    # Filter by halo type list
    filtered = filter_observations(collection, halo_type=[22, 23])
    assert len(filtered) == 3, f"Expected 3 observations for halo_type=[22, 23], got {len(filtered)}"
    print(f"✓ filter by halo_type=[22, 23] -> {len(filtered)} observations")
    
    # Filter by month
    filtered = filter_observations(collection, month=1)
    assert len(filtered) == 2, f"Expected 2 observations for month=1, got {len(filtered)}"
    print(f"✓ filter by month=1 -> {len(filtered)} observations")
    
    # Custom filter function
    filtered = filter_observations(collection, custom_filter=lambda obs: int(obs.get('H', '0') or '0') >= 5)
    assert len(filtered) == 4, f"Expected 4 observations with H >= 5, got {len(filtered)}"
    print(f"✓ filter by custom_filter (H >= 5) -> {len(filtered)} observations")


def test_statistics():
    """Test statistics functions."""
    print("\n=== Test: Statistics ===")
    
    collection = [
        create_test_observation(kk=44, jj=24, mm=1, tt=15),
        create_test_observation(kk=45, jj=24, mm=6, tt=20),
        create_test_observation(kk=44, jj=25, mm=1, tt=10),
        create_test_observation(kk=46, jj=25, mm=12, tt=25),
    ]
    
    # Count observations
    count = count_observations(collection, observer_kk=44)
    assert count == 2, f"Expected 2 observations for KK=44, got {count}"
    print(f"✓ count_observations(observer_kk=44) -> {count}")
    
    # Get date range
    date_range = get_date_range(collection)
    assert date_range is not None, "get_date_range() should return date range"
    (min_y, min_m, min_d), (max_y, max_m, max_d) = date_range
    assert (min_y, min_m, min_d) == (2024, 1, 15), f"Expected min date 2024-01-15, got {min_y}-{min_m}-{min_d}"
    assert (max_y, max_m, max_d) == (2025, 12, 25), f"Expected max date 2025-12-25, got {max_y}-{max_m}-{max_d}"
    print(f"✓ get_date_range() -> {min_y}-{min_m:02d}-{min_d:02d} to {max_y}-{max_m:02d}-{max_d:02d}")
    
    # Get observers
    observers = get_observers(collection)
    assert observers == [44, 45, 46], f"Expected [44, 45, 46], got {observers}"
    print(f"✓ get_observers() -> {observers}")
    
    # Test empty collection
    empty_range = get_date_range([])
    assert empty_range is None, "get_date_range([]) should return None"
    print(f"✓ get_date_range([]) -> None")


# ============================================================================
# Test Cases: Format Conversion
# ============================================================================

def test_format_conversion():
    """Test legacy format conversion."""
    print("\n=== Test: Format Conversion ===")
    
    # Create legacy observation
    legacy = create_test_observation()
    legacy['d'] = '255'    # Legacy encoding for "no cirrus"
    
    collection = [legacy]
    
    # Check if conversion needed
    assert needs_conversion(collection) == True, "needs_conversion() should detect legacy format"
    print(f"✓ needs_conversion() detected legacy format (d=255)")
    
    # Convert single observation
    modern = convert_legacy_observation(legacy)
    assert modern['d'] == '0', f"Expected d='0' (converted from 255), got {modern['d']}"
    print(f"✓ convert_legacy_observation() converted: d 255→{modern['d']}")
    
    # Convert collection
    converted = convert_all_legacy_format(collection)
    assert converted[0]['d'] == '0', f"Expected d='0', got {converted[0]['d']}"
    print(f"✓ convert_all_legacy_format() converted collection")
    
    # Check modern format doesn't need conversion
    modern_col = [create_test_observation()]
    assert needs_conversion(modern_col) == False, "needs_conversion() should return False for modern format"
    print(f"✓ needs_conversion() -> False for modern format")


# ============================================================================
# Test Cases: Validation
# ============================================================================

def test_validation():
    """Test observation validation."""
    print("\n=== Test: Validation ===")
    
    # Valid observation
    valid_obs = create_test_observation()
    is_valid, errors = validate_observation(valid_obs)
    
    assert is_valid == True, "validate_observation() should return True for valid observation"
    assert len(errors) == 0, f"Expected no errors, got {len(errors)}"
    print(f"✓ validate_observation() valid -> True, no errors")
    
    # Invalid observation (multiple errors)
    invalid_obs = create_test_observation()
    invalid_obs['KK'] = '0'   # Invalid (must be 1-99)
    invalid_obs['MM'] = '13'  # Invalid (must be 1-12)
    invalid_obs['EE'] = '99'  # Invalid halo type
    
    is_valid, errors = validate_observation(invalid_obs)
    
    assert is_valid == False, "validate_observation() should return False for invalid observation"
    assert len(errors) >= 2, f"Expected at least 2 errors, got {len(errors)}"
    print(f"✓ validate_observation() invalid -> False, {len(errors)} errors:")
    for error in errors:
        print(f"    - {error}")
    
    # Validate collection
    collection = [
        create_test_observation(),  # Valid
        invalid_obs,                # Invalid
        create_test_observation(),  # Valid
    ]
    
    validation_errors = validate_collection(collection)
    
    assert len(validation_errors) == 1, f"Expected 1 invalid observation, got {len(validation_errors)}"
    assert 1 in validation_errors, "Invalid observation should be at index 1"
    print(f"✓ validate_collection() found {len(validation_errors)} invalid observation(s) at index {list(validation_errors.keys())}")


# ============================================================================
# Main Test Runner
# ============================================================================

def run_all_tests():
    """Run all Layer 2 tests."""
    print("=" * 70)
    print("Testing observations.py (Layer 2 - Data Management)")
    print("=" * 70)
    print("\nThese tests are storage-agnostic and reusable for:")
    print("  - Layer 3a: File Operations (observations_file.py)")
    print("  - Layer 3b: Database Operations (observations_db.py)")
    print()
    
    tests = [
        ("Key Management", test_key_management),
        ("Find Operations", test_find_operations),
        ("Add Observation", test_add_observation),
        ("Update Observation", test_update_observation),
        ("Delete Observation", test_delete_observation),
        ("Sort Observations", test_sort_observations),
        ("Merge Observations", test_merge_observations),
        ("Duplicates", test_duplicates),
        ("Filter Observations", test_filter_observations),
        ("Statistics", test_statistics),
        ("Format Conversion", test_format_conversion),
        ("Validation", test_validation),
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
