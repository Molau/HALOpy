"""
Test Suite for observers.py (Layer 2 - Data Management)

Tests all storage-agnostic functions with in-memory collections.
These tests are 100% reusable for both File (Layer 3a) and Database (Layer 3b)
implementations, as they contain no I/O dependencies.

Layer 2 Functions Tested:
- Sorting: sort_observers()
- Finding: find_observer_records()
- CRUD: add_observer_record(), update_observer_record(), delete_observer_record()

Important Notes:
- Sorting is ONLY relevant for File Storage (CSV has no inherent order)
- Database Storage (Layer 3b) will NOT need sorting - SQL ORDER BY handles that
- Layer 2 sort_observers() remains useful for in-memory operations and file prep

Usage:
    python tests/io/test_observers_layer2.py
    python -m pytest tests/io/test_observers_layer2.py -v
"""

from pathlib import Path
import sys

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))

from halo.io.observers import (
    sort_observers,
    find_observer_records,
    add_observer_record,
    update_observer_record,
    delete_observer_record,
    _observer_sort_key
)


# ============================================================================
# Test Data
# ============================================================================

def create_test_observer(kk='44', seit='01/25', vname='John', nname='Doe', 
                        hbort='Berlin', active='1'):
    """Create a test observer record with 21 fields."""
    return [
        kk,           # 0: KK
        vname,        # 1: VName
        nname,        # 2: NName
        seit,         # 3: seit
        active,       # 4: active
        hbort,        # 5: HbOrt
        '12',         # 6: GH (geographic region)
        '13',         # 7: HLG (longitude degrees)
        '30',         # 8: HLM (longitude minutes)
        'O',          # 9: HOW (East/West)
        '52',         # 10: HBG (latitude degrees)
        '31',         # 11: HBM (latitude minutes)
        'N',          # 12: HNS (North/South)
        '',           # 13: NbOrt (secondary site)
        '0',          # 14: GN
        '0',          # 15: NLG
        '0',          # 16: NLM
        'O',          # 17: NOW
        '0',          # 18: NBG
        '0',          # 19: NBM
        'N'           # 20: NNS
    ]


def create_test_collection():
    """Create a test collection with multiple observers and sites."""
    return [
        create_test_observer('04', '01/85', 'Alice', 'Smith', 'Hamburg'),
        create_test_observer('04', '06/90', 'Alice', 'Smith', 'München'),  # Same observer, different site
        create_test_observer('44', '03/20', 'Bob', 'Jones', 'Berlin'),
        create_test_observer('44', '01/25', 'Bob', 'Jones', 'Dresden'),    # Same observer, different site
        create_test_observer('12', '12/49', 'Charlie', 'Brown', 'Köln'),   # Year 49 = 1949
        create_test_observer('12', '01/50', 'Charlie', 'Brown', 'Bonn'),   # Year 50 = 1950
    ]


# ============================================================================
# Test 1: Sorting (_observer_sort_key)
# ============================================================================

def test_observer_sort_key():
    """Test sort key generation for observers."""
    
    # Test basic KK and seit parsing
    obs1 = create_test_observer('04', '01/85')  # January 1985
    obs2 = create_test_observer('04', '06/90')  # June 1990
    obs3 = create_test_observer('44', '03/20')  # March 2020
    
    key1 = _observer_sort_key(obs1)
    key2 = _observer_sort_key(obs2)
    key3 = _observer_sort_key(obs3)
    
    # Check keys are tuples of (KK, YYYYMM)
    assert key1 == ('04', 198501), f"Expected ('04', 198501), got {key1}"
    assert key2 == ('04', 199006), f"Expected ('04', 199006), got {key2}"
    assert key3 == ('44', 202003), f"Expected ('44', 202003), got {key3}"
    
    # Test year conversion: < 80 = 20xx, >= 80 = 19xx
    obs_2049 = create_test_observer('12', '12/49')  # December 2049
    obs_2050 = create_test_observer('12', '01/50')  # January 2050
    
    key_49 = _observer_sort_key(obs_2049)
    key_50 = _observer_sort_key(obs_2050)
    
    assert key_49 == ('12', 204912), f"Year 49 should be 2049, got {key_49}"
    assert key_50 == ('12', 205001), f"Year 50 should be 2050, got {key_50}"
    
    print("✓ Test 1 passed: _observer_sort_key() works correctly")


# ============================================================================
# Test 2: Sorting (sort_observers)
# ============================================================================

def test_sort_observers():
    """Test sorting of observer collection."""
    
    # Create unsorted collection
    unsorted = [
        create_test_observer('44', '01/25', 'Bob', 'Jones'),     # Should be 3rd
        create_test_observer('04', '06/90', 'Alice', 'Smith'),   # Should be 2nd
        create_test_observer('04', '01/85', 'Alice', 'Smith'),   # Should be 1st (earliest)
        create_test_observer('44', '03/20', 'Bob', 'Jones'),     # Should be 4th
    ]
    
    # Sort
    sorted_obs = sort_observers(unsorted)
    
    # Verify order: by KK first, then by seit chronologically
    assert sorted_obs[0][0] == '04' and sorted_obs[0][3] == '01/85', "First should be 04, 01/85"
    assert sorted_obs[1][0] == '04' and sorted_obs[1][3] == '06/90', "Second should be 04, 06/90"
    assert sorted_obs[2][0] == '44' and sorted_obs[2][3] == '03/20', "Third should be 44, 03/20"
    assert sorted_obs[3][0] == '44' and sorted_obs[3][3] == '01/25', "Fourth should be 44, 01/25"
    
    # Verify original list was not modified (returns new list)
    assert unsorted[0][0] == '44', "Original list should not be modified"
    
    print("✓ Test 2 passed: sort_observers() works correctly")


# ============================================================================
# Test 3: Finding (find_observer_records)
# ============================================================================

def test_find_observer_records():
    """Test finding all records for a specific observer."""
    
    collection = create_test_collection()
    
    # Find all records for observer 04
    records_04 = find_observer_records('04', collection)
    assert len(records_04) == 2, f"Expected 2 records for KK=04, got {len(records_04)}"
    assert all(rec[0] == '04' for rec in records_04), "All records should have KK=04"
    
    # Find all records for observer 44
    records_44 = find_observer_records('44', collection)
    assert len(records_44) == 2, f"Expected 2 records for KK=44, got {len(records_44)}"
    
    # Find records for observer 12
    records_12 = find_observer_records('12', collection)
    assert len(records_12) == 2, f"Expected 2 records for KK=12, got {len(records_12)}"
    
    # Find records for non-existent observer
    records_99 = find_observer_records('99', collection)
    assert len(records_99) == 0, "Non-existent observer should return empty list"
    
    # Test KK normalization (leading zero)
    records_4 = find_observer_records('4', collection)  # '4' should match '04'
    assert len(records_4) == 2, "KK='4' should be normalized to '04'"
    
    print("✓ Test 3 passed: find_observer_records() works correctly")


# ============================================================================
# Test 4: Adding (add_observer_record)
# ============================================================================

def test_add_observer_record():
    """Test adding a new observer record."""
    
    collection = [
        create_test_observer('04', '01/85'),
        create_test_observer('44', '03/20'),
    ]
    
    # Add new record
    new_record = create_test_observer('12', '06/15', 'Charlie', 'Brown', 'Köln')
    updated = add_observer_record(new_record, collection)
    
    # Verify record was added
    assert len(updated) == 3, f"Expected 3 records, got {len(updated)}"
    
    # Verify sorting (should be sorted by KK)
    assert updated[0][0] == '04', "First should be 04"
    assert updated[1][0] == '12', "Second should be 12 (newly added)"
    assert updated[2][0] == '44', "Third should be 44"
    
    # Verify original collection not modified
    assert len(collection) == 2, "Original collection should not be modified"
    
    # Add another site for existing observer
    new_site = create_test_observer('04', '12/95', 'Alice', 'Smith', 'Stuttgart')
    updated2 = add_observer_record(new_site, updated)
    
    assert len(updated2) == 4, "Should have 4 records after adding second site"
    records_04 = find_observer_records('04', updated2)
    assert len(records_04) == 2, "Observer 04 should now have 2 sites"
    
    print("✓ Test 4 passed: add_observer_record() works correctly")


# ============================================================================
# Test 5: Updating (update_observer_record)
# ============================================================================

def test_update_observer_record():
    """Test updating a specific observer record."""
    
    collection = create_test_collection()
    
    # Update active status for observer 04, site since 01/85
    success, updated = update_observer_record('04', '01/85', {4: '0'}, collection)
    
    assert success, "Update should succeed"
    assert len(updated) == len(collection), "Collection size should not change"
    
    # Find updated record and verify change
    records_04 = find_observer_records('04', updated)
    record_0185 = [r for r in records_04 if r[3] == '01/85'][0]
    assert record_0185[4] == '0', f"Active status should be '0', got {record_0185[4]}"
    
    # Update multiple fields
    success2, updated2 = update_observer_record(
        '44', '03/20', 
        {1: 'Robert', 5: 'Hamburg'}, 
        updated
    )
    
    assert success2, "Second update should succeed"
    records_44 = find_observer_records('44', updated2)
    record_0320 = [r for r in records_44 if r[3] == '03/20'][0]
    assert record_0320[1] == 'Robert', "VName should be updated"
    assert record_0320[5] == 'Hamburg', "HbOrt should be updated"
    
    # Try to update non-existent record
    success3, updated3 = update_observer_record('99', '01/20', {4: '0'}, updated2)
    assert not success3, "Update of non-existent record should fail"
    assert len(updated3) == len(updated2), "Collection should not change on failed update"
    
    print("✓ Test 5 passed: update_observer_record() works correctly")


# ============================================================================
# Test 6: Deleting (delete_observer_record)
# ============================================================================

def test_delete_observer_record():
    """Test deleting observer records."""
    
    collection = create_test_collection()
    initial_count = len(collection)
    
    # Delete specific site for observer 04
    deleted_count, updated = delete_observer_record('04', '01/85', collection)
    
    assert deleted_count == 1, f"Expected to delete 1 record, deleted {deleted_count}"
    assert len(updated) == initial_count - 1, "Collection size should decrease by 1"
    
    # Verify record was deleted
    records_04 = find_observer_records('04', updated)
    assert len(records_04) == 1, "Observer 04 should have 1 site left"
    remaining_site = records_04[0]
    assert remaining_site[3] == '06/90', "Remaining site should be 06/90"
    
    # Delete all records for observer 44
    deleted_count2, updated2 = delete_observer_record('44', None, updated)
    
    assert deleted_count2 == 2, f"Expected to delete 2 records for KK=44, deleted {deleted_count2}"
    records_44 = find_observer_records('44', updated2)
    assert len(records_44) == 0, "All records for KK=44 should be deleted"
    
    # Try to delete non-existent record
    deleted_count3, updated3 = delete_observer_record('99', '01/20', updated2)
    assert deleted_count3 == 0, "Deleting non-existent record should return 0"
    assert len(updated3) == len(updated2), "Collection should not change"
    
    print("✓ Test 6 passed: delete_observer_record() works correctly")


# ============================================================================
# Test 7: Edge Cases
# ============================================================================

def test_edge_cases():
    """Test edge cases and error handling."""
    
    # Empty collection
    empty = []
    sorted_empty = sort_observers(empty)
    assert len(sorted_empty) == 0, "Sorting empty collection should return empty list"
    
    found_empty = find_observer_records('04', empty)
    assert len(found_empty) == 0, "Finding in empty collection should return empty list"
    
    # Single record
    single = [create_test_observer('04', '01/85')]
    sorted_single = sort_observers(single)
    assert len(sorted_single) == 1, "Sorting single record should work"
    
    # Invalid seit format (should not crash)
    obs_invalid = create_test_observer('04', 'invalid')
    key = _observer_sort_key(obs_invalid)
    assert key == ('04', 0), "Invalid seit should fallback to 0"
    
    # Empty seit
    obs_empty_seit = create_test_observer('04', '')
    key2 = _observer_sort_key(obs_empty_seit)
    assert key2 == ('04', 0), "Empty seit should fallback to 0"
    
    print("✓ Test 7 passed: Edge cases handled correctly")


# ============================================================================
# Test 8: Complete Workflow
# ============================================================================

def test_complete_workflow():
    """Test a complete CRUD workflow."""
    
    # Start with empty collection
    observers = []
    
    # Add first observer
    obs1 = create_test_observer('04', '01/85', 'Alice', 'Smith', 'Hamburg')
    observers = add_observer_record(obs1, observers)
    assert len(observers) == 1
    
    # Add second observer
    obs2 = create_test_observer('44', '03/20', 'Bob', 'Jones', 'Berlin')
    observers = add_observer_record(obs2, observers)
    assert len(observers) == 2
    
    # Add another site for first observer
    obs3 = create_test_observer('04', '06/90', 'Alice', 'Smith', 'München')
    observers = add_observer_record(obs3, observers)
    assert len(observers) == 3
    
    # Verify sorting
    assert observers[0][0] == '04' and observers[0][3] == '01/85'
    assert observers[1][0] == '04' and observers[1][3] == '06/90'
    assert observers[2][0] == '44' and observers[2][3] == '03/20'
    
    # Update observer 04's first site
    success, observers = update_observer_record('04', '01/85', {4: '0'}, observers)
    assert success
    
    # Find and verify update
    records_04 = find_observer_records('04', observers)
    assert len(records_04) == 2
    assert records_04[0][4] == '0'  # Active status changed
    
    # Delete one site
    count, observers = delete_observer_record('04', '06/90', observers)
    assert count == 1
    assert len(observers) == 2
    
    # Delete entire observer
    count, observers = delete_observer_record('44', None, observers)
    assert count == 1
    assert len(observers) == 1
    
    # Final verification
    assert observers[0][0] == '04'
    assert observers[0][3] == '01/85'
    assert observers[0][4] == '0'
    
    print("✓ Test 8 passed: Complete workflow works correctly")


# ============================================================================
# Main Test Runner
# ============================================================================

def run_all_tests():
    """Run all Layer 2 tests."""
    
    print("=" * 70)
    print("Observer Layer 2 Tests (Storage-Agnostic Business Logic)")
    print("=" * 70)
    print()
    
    tests = [
        ("Sort Key Generation", test_observer_sort_key),
        ("Sorting", test_sort_observers),
        ("Finding Records", test_find_observer_records),
        ("Adding Records", test_add_observer_record),
        ("Updating Records", test_update_observer_record),
        ("Deleting Records", test_delete_observer_record),
        ("Edge Cases", test_edge_cases),
        ("Complete Workflow", test_complete_workflow),
    ]
    
    passed = 0
    failed = 0
    
    for name, test_func in tests:
        try:
            print(f"Running: {name}...")
            test_func()
            passed += 1
            print()
        except AssertionError as e:
            failed += 1
            print(f"✗ FAILED: {name}")
            print(f"  Error: {e}")
            print()
        except Exception as e:
            failed += 1
            print(f"✗ ERROR: {name}")
            print(f"  Exception: {e}")
            import traceback
            traceback.print_exc()
            print()
    
    print("=" * 70)
    print(f"Results: {passed} passed, {failed} failed out of {len(tests)} tests")
    print("=" * 70)
    print()
    
    if failed == 0:
        print("✓ ALL TESTS PASSED!")
        print()
        print("Layer 2 is storage-agnostic and ready for:")
        print("  - Layer 3a: File Storage (observers_file.py)")
        print("  - Layer 3b: Database Storage (observers_db.py - future)")
        return 0
    else:
        print(f"✗ {failed} test(s) failed - please review")
        return 1


if __name__ == '__main__':
    exit_code = run_all_tests()
    sys.exit(exit_code)
