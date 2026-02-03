#!/usr/bin/env python3
"""
i18n Key Validation Script - SIMPLE VERSION
============================================

Validates i18n key usage by comparing code references against actual i18n definitions.
NO NORMALIZATION, NO LOGIC - just simple comparison.

Checks:
1. Missing Keys - Referenced in code but NOT defined in strings_de.json
2. Unused Keys - Defined in strings_de.json but NOT used anywhere in code
3. DE/EN Synchronization - Verify both language files have identical structure

Output: Report of missing and unused i18n keys.
"""

import json
import csv
from pathlib import Path
from datetime import datetime
from collections import defaultdict


# Common JavaScript string methods that might appear after i18n keys
JS_STRING_METHODS = {
    'replace', 'padEnd', 'padStart', 'trim', 'trimStart', 'trimEnd',
    'toLowerCase', 'toUpperCase', 'slice', 'substring', 'substr',
    'charAt', 'indexOf', 'lastIndexOf', 'includes', 'startsWith', 'endsWith',
    'split', 'join', 'repeat', 'concat', 'match', 'search', 'localeCompare',
    # Array/Object properties and methods
    'length', 'push', 'pop', 'shift', 'unshift', 'forEach', 'map', 'filter',
    'reduce', 'find', 'findIndex', 'some', 'every', 'sort', 'reverse',
    # Common Python methods
    'format', 'strip', 'lstrip', 'rstrip', 'upper', 'lower', 'title',
    'capitalize', 'swapcase', 'count', 'find', 'rfind', 'index', 'rindex'
}


def clean_js_method_calls(key):
    """Remove JavaScript method calls from the end of i18n keys.
    
    Examples:
        'annual_stats.chart_title.replace' -> 'annual_stats.chart_title'
        'statistics.table_day.padEnd' -> 'statistics.table_day'
        'edit_site_info.trim' -> 'edit_site_info'
    """
    parts = key.split('.')
    if len(parts) > 1 and parts[-1] in JS_STRING_METHODS:
        return '.'.join(parts[:-1])
    return key


def flatten_dict(d, parent_key='', sep='.', leaf_only=False):
    """Flatten nested dictionary into dot-notation keys.
    
    Args:
        d: Dictionary to flatten
        parent_key: Parent key prefix
        sep: Separator for key parts
        leaf_only: If True, only return leaf nodes (no intermediate objects)
    
    Examples:
        Input: {"analysis_dialog": {"param_names": {"JJ": "Jahr"}}}
        
        leaf_only=False:
            - analysis_dialog
            - analysis_dialog.param_names
            - analysis_dialog.param_names.JJ
        
        leaf_only=True:
            - analysis_dialog.param_names.JJ (only the leaf)
    """
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            # Add intermediate key if not leaf_only
            if not leaf_only:
                items.append((new_key, v))
            # Recursively flatten nested dicts
            items.extend(flatten_dict(v, new_key, sep=sep, leaf_only=leaf_only).items())
        else:
            # Always add leaf nodes
            items.append((new_key, v))
    return dict(items)


def load_i18n_keys(i18n_file, leaf_only=False):
    """Load all defined i18n keys from strings_de.json.
    
    Args:
        i18n_file: Path to strings_de.json
        leaf_only: If False (default), extract ALL keys including intermediate objects
                   If True, only extract leaf nodes (actual values)
    
    Returns:
        Set of all flattened key paths:
        - leaf_only=False: 'analysis_dialog', 'analysis_dialog.param_names', 'analysis_dialog.param_names.JJ'
        - leaf_only=True: only 'analysis_dialog.param_names.JJ'
    """
    with open(i18n_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Flatten nested structure to dot notation
    # leaf_only=False: Extract ALL keys (intermediate + leaves) for dynamic access like obj[key]
    flat = flatten_dict(data, leaf_only=leaf_only)
    return set(flat.keys())


def load_code_references(audit_csv):
    """Load all i18n key references from audit CSV file - simple list."""
    references = defaultdict(list)
    
    with open(audit_csv, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = row['key']
            context = row['context']
            
            # Clean JavaScript method calls from the key
            cleaned_key = clean_js_method_calls(key)
            
            references[cleaned_key].append({
                'file': row['file'],
                'line': row['line'],
                'context': context
            })
    
    return references


def main():
    """Main validation function."""
    print("=" * 80)
    print("HALOpy i18n Key Validation - SIMPLE")
    print("=" * 80)
    print()
    
    base_dir = Path(__file__).parent.parent
    
    # Load i18n definitions
    i18n_file = base_dir / 'resources' / 'strings_de.json'
    print(f"Loading i18n definitions from: {i18n_file}")
    defined_keys = load_i18n_keys(i18n_file)
    print(f"  → {len(defined_keys)} keys defined in strings_de.json")
    
    # Load strings_de.json data for later DE/EN sync check
    with open(i18n_file, 'r', encoding='utf-8') as f:
        strings_de = json.load(f)
    print()
    
    # Find most recent audit CSV
    temp_dir = base_dir / 'temp'
    audit_files = sorted(temp_dir.glob('i18n_audit_*.csv'), reverse=True)
    
    if not audit_files:
        print("ERROR: No audit CSV file found!")
        print("Please run audit_i18n_usage.py first.")
        return
    
    audit_csv = audit_files[0]
    print(f"Loading code references from: {audit_csv}")
    code_references = load_code_references(audit_csv)
    print(f"  → {len(code_references)} unique keys referenced in code")
    print()
    
    # Find missing keys (in code but not defined)
    missing_keys = {}
    for key in code_references.keys():
        if key not in defined_keys:
            missing_keys[key] = code_references[key]
    
    # Find unused keys (defined but not used)
    # IMPORTANT: Handle two cases:
    # 1. If a parent object is referenced (e.g., i18nStrings.brightness),
    #    mark ALL its children as used (brightness.0, brightness.1, etc.)
    #    This handles dynamic array access: i18nStrings.brightness[i.toString()]
    # 2. If a child is referenced (e.g., dialogs.error.title),
    #    mark ALL its parents as used (dialogs, dialogs.error)
    #    Parent objects must exist for child access to work
    unused_keys = set()
    for key in defined_keys:
        # Check if key is directly referenced
        if key in code_references:
            continue
        
        # Check if any parent of this key is referenced (dynamic array access)
        # Example: brightness.0 is used if "brightness" is referenced
        is_child_of_referenced = False
        parts = key.split('.')
        for i in range(1, len(parts)):
            parent_key = '.'.join(parts[:i])
            if parent_key in code_references:
                is_child_of_referenced = True
                break
        
        # Check if any child of this key is referenced (parent objects)
        # Example: dialogs.error is used if "dialogs.error.title" is referenced
        is_parent_of_referenced = False
        for ref_key in code_references.keys():
            if ref_key.startswith(key + '.'):
                is_parent_of_referenced = True
                break
        
        if not is_child_of_referenced and not is_parent_of_referenced:
            unused_keys.add(key)
    
    # Generate report
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    report_file = base_dir / 'temp' / f'i18n_validation_{timestamp}.txt'
    
    print(f"Writing validation report to: {report_file}")
    print()
    
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("i18n Key Validation Report - SIMPLE\n")
        f.write("=" * 80 + "\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        f.write("SUMMARY\n")
        f.write("-" * 80 + "\n")
        f.write(f"Keys defined in strings_de.json: {len(defined_keys)}\n")
        f.write(f"Keys referenced in code:         {len(code_references)}\n")
        f.write(f"Missing keys (in code, not defined): {len(missing_keys)}\n")
        f.write(f"Unused keys (defined, not used):     {len(unused_keys)}\n")
        f.write("\n\n")
        
        # Missing keys section
        f.write("=" * 80 + "\n")
        f.write("MISSING KEYS - Referenced in code but NOT defined in strings_de.json\n")
        f.write("=" * 80 + "\n")
        f.write("\n")
        
        if missing_keys:
            f.write(f"Found {len(missing_keys)} missing keys:\n\n")
            
            for key in sorted(missing_keys.keys()):
                refs = missing_keys[key]
                f.write(f"Key: {key}\n")
                f.write(f"  Used {len(refs)} times:\n")
                
                # Group by file
                by_file = defaultdict(list)
                for ref in refs:
                    by_file[ref['file']].append(ref)
                
                for file_path in sorted(by_file.keys()):
                    file_refs = by_file[file_path]
                    rel_path = Path(file_path).relative_to(base_dir)
                    f.write(f"    - {rel_path}\n")
                    for ref in file_refs:
                        f.write(f"        Line {ref['line']}: {ref['context'][:80]}\n")
                
                f.write("\n")
        else:
            f.write("✓ No missing keys found! All code references are defined.\n\n")
        
        # Unused keys section
        f.write("=" * 80 + "\n")
        f.write("UNUSED KEYS - Defined in strings_de.json but NOT used in code\n")
        f.write("=" * 80 + "\n")
        f.write("\n")
        
        if unused_keys:
            f.write(f"Found {len(unused_keys)} unused keys:\n\n")
            
            # Group by top-level category
            by_category = defaultdict(list)
            for key in unused_keys:
                category = key.split('.')[0] if '.' in key else 'root'
                by_category[category].append(key)
            
            for category in sorted(by_category.keys()):
                keys = sorted(by_category[category])
                f.write(f"\n{category}.*\n")
                f.write("-" * 40 + "\n")
                for key in keys:
                    f.write(f"  - {key}\n")
        else:
            f.write("✓ No unused keys found! All definitions are used in code.\n\n")
        
        # DE/EN Synchronization section
        f.write("\n")
        f.write("=" * 80 + "\n")
        f.write("DE/EN SYNCHRONIZATION CHECK\n")
        f.write("=" * 80 + "\n")
        f.write("\n")
        
        en_file = i18n_file.parent / 'strings_en.json'
        if en_file.exists():
            with open(en_file, 'r', encoding='utf-8') as en_f:
                en_data = json.load(en_f)
            
            # Flatten both structures to compare ALL keys (not just top-level)
            de_all_keys = set(flatten_dict(strings_de, leaf_only=False).keys())
            en_all_keys = set(flatten_dict(en_data, leaf_only=False).keys())
            
            f.write(f"DE total keys (all levels): {len(de_all_keys)}\n")
            f.write(f"EN total keys (all levels): {len(en_all_keys)}\n")
            f.write("\n")
            
            missing_in_en = de_all_keys - en_all_keys
            missing_in_de = en_all_keys - de_all_keys
            
            if missing_in_en or missing_in_de:
                f.write("⚠ STRUCTURE MISMATCH DETECTED\n\n")
                if missing_in_en:
                    f.write(f"Missing in EN ({len(missing_in_en)} keys):\n")
                    for key in sorted(missing_in_en):
                        f.write(f"  - {key}\n")
                    f.write("\n")
                if missing_in_de:
                    f.write(f"Missing in DE ({len(missing_in_de)} keys):\n")
                    for key in sorted(missing_in_de):
                        f.write(f"  - {key}\n")
                    f.write("\n")
            else:
                f.write("✓ DE/EN SYNCHRONIZED - Both files have identical structure (all levels)\n\n")
        else:
            f.write(f"⚠ WARNING: strings_en.json not found at {en_file}\n\n")
        
        f.write("\n")
        f.write("=" * 80 + "\n")
        f.write("END OF REPORT\n")
        f.write("=" * 80 + "\n")
    
    # Print summary to console
    print("=" * 80)
    print("VALIDATION RESULTS:")
    print("-" * 80)
    print(f"Keys defined in strings_de.json: {len(defined_keys)}")
    print(f"Keys referenced in code:         {len(code_references)}")
    
    if missing_keys:
        print(f"\n⚠ MISSING KEYS: {len(missing_keys)} keys referenced but not defined")
        print(f"  → These may cause runtime errors!")
        print(f"\nTop 10 missing keys:")
        for key in sorted(missing_keys.keys())[:10]:
            count = len(missing_keys[key])
            print(f"  - {key} (used {count}x)")
    else:
        print(f"\n✓ NO MISSING KEYS")
    
    if unused_keys:
        print(f"\nℹ UNUSED KEYS: {len(unused_keys)} keys defined but not used")
        print(f"  → These could be removed to clean up i18n files")
        print(f"\nTop 10 unused keys:")
        for key in sorted(unused_keys)[:10]:
            print(f"  - {key}")
    else:
        print(f"\n✓ NO UNUSED KEYS")
    
    # Check DE/EN synchronization
    print()
    print("=" * 80)
    print("DE/EN SYNCHRONIZATION CHECK:")
    print("-" * 80)
    
    en_file = i18n_file.parent / 'strings_en.json'
    if en_file.exists():
        with open(en_file, 'r', encoding='utf-8') as f:
            en_data = json.load(f)
        
        # Flatten both structures to compare ALL keys (not just top-level)
        de_all_keys = set(flatten_dict(strings_de, leaf_only=False).keys())
        en_all_keys = set(flatten_dict(en_data, leaf_only=False).keys())
        
        print(f"DE total keys (all levels): {len(de_all_keys)}")
        print(f"EN total keys (all levels): {len(en_all_keys)}")
        
        missing_in_en = de_all_keys - en_all_keys
        missing_in_de = en_all_keys - de_all_keys
        
        if missing_in_en or missing_in_de:
            print(f"\n⚠ STRUCTURE MISMATCH DETECTED")
            if missing_in_en:
                print(f"\nMissing in EN ({len(missing_in_en)} keys):")
                for key in sorted(missing_in_en)[:10]:  # Show first 10
                    print(f"  - {key}")
                if len(missing_in_en) > 10:
                    print(f"  ... and {len(missing_in_en) - 10} more")
            if missing_in_de:
                print(f"\nMissing in DE ({len(missing_in_de)} keys):")
                for key in sorted(missing_in_de)[:10]:  # Show first 10
                    print(f"  - {key}")
                if len(missing_in_de) > 10:
                    print(f"  ... and {len(missing_in_de) - 10} more")
        else:
            print(f"\n✓ DE/EN SYNCHRONIZED - Both files have identical structure (all levels)")
    else:
        print(f"\n⚠ WARNING: strings_en.json not found at {en_file}")
    
    print()
    print("=" * 80)
    print(f"Full report saved to: {report_file}")
    print("=" * 80)
    print()


if __name__ == '__main__':
    main()
