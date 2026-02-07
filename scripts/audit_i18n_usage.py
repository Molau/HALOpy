#!/usr/bin/env python3
"""
i18n Usage Audit Script
=======================

Scans HALOpy source code for all i18n key references.
Does NOT make corrections - only lists all found references for manual review.

Output: CSV file with all i18n key usages across the codebase.
"""

import os
import re
import csv
from pathlib import Path
from datetime import datetime


# Patterns for different file types
PATTERNS = {
    'javascript': [
        # Extract complete dotted path after i18nStrings
        # Matches: i18nStrings.brightness, i18nStrings.analysis_dialog.param_names.JJ, etc.
        # Captures everything up to a non-word character (excluding dots)
        r'i18nStrings\.((?:[a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_]*)',
    ],
    'python': [
        # i18n['key'] - bracket notation
        r'i18n\[(["\'])([a-zA-Z_][a-zA-Z0-9_\.]*)\1\]',
        # _('key'), _("key") - translation function
        r'_\((["\'])([a-zA-Z_][a-zA-Z0-9_\.]*)\1\)',
        # i18n.strings - direct attribute access (exclude method calls)
        # Only matches if followed by word boundary, not by '(' or more dots+methods
        r'i18n\.strings(?!\()',
    ],
    'html': [
        # {{ i18n.key }}, {{ i18nStrings.key }}
        r'\{\{\s*i18n(?:Strings)?\.((?:[a-zA-Z_][a-zA-Z0-9_]*\.)*[a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}',
        # {% trans 'key' %}, {{ _('key') }}
        r'\{%\s*trans\s+(["\'])([a-zA-Z_][a-zA-Z0-9_\.]*)\1\s*%\}',
        r'\{\{\s*_\((["\'])([a-zA-Z_][a-zA-Z0-9_\.]*)\1\)\s*\}\}',
        # {{ g.i18n.get('key') }} - Flask template pattern
        r"g\.i18n\.get\(['\"]([a-zA-Z_][a-zA-Z0-9_\.]*)['\"]\)",
    ]
}


def extract_key_from_match(match, pattern_type):
    """Extract the actual key from a regex match - simple, no processing."""
    groups = match.groups()
    
    # Get the raw key (first non-None group that's not a quote)
    for g in groups:
        if g and g not in ['"', "'"]:
            return g
    
    return None


def scan_file(filepath, file_type):
    """Scan a single file for i18n references."""
    results = []
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            
        for line_num, line in enumerate(lines, 1):
            for pattern in PATTERNS.get(file_type, []):
                for match in re.finditer(pattern, line):
                    key = extract_key_from_match(match, file_type)
                    if key:
                        results.append({
                            'file': str(filepath),
                            'line': line_num,
                            'key': key,
                            'context': line.strip()  # Full line, no truncation
                        })
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
    
    return results


def scan_directory(base_path, extensions, file_type):
    """Scan all files in a directory with given extensions."""
    results = []
    base_path = Path(base_path)
    
    if not base_path.exists():
        print(f"Directory not found: {base_path}")
        return results
    
    for ext in extensions:
        for filepath in base_path.rglob(f'*{ext}'):
            # Skip node_modules, venv, etc.
            if any(skip in str(filepath) for skip in ['node_modules', 'venv', '.git', '__pycache__']):
                continue
            
            print(f"Scanning: {filepath}")
            results.extend(scan_file(filepath, file_type))
    
    return results


def main():
    """Main audit function."""
    print("=" * 80)
    print("HALOpy i18n Usage Audit")
    print("=" * 80)
    print()
    
    base_dir = Path(__file__).parent.parent
    all_results = []
    
    # Scan JavaScript files
    print("Scanning JavaScript files...")
    js_results = scan_directory(
        base_dir / 'static' / 'js',
        ['.js'],
        'javascript'
    )
    all_results.extend(js_results)
    print(f"Found {len(js_results)} JavaScript i18n references")
    print()
    
    # Scan Python files
    print("Scanning Python files...")
    py_results = scan_directory(
        base_dir / 'src',
        ['.py'],
        'python'
    )
    all_results.extend(py_results)
    print(f"Found {len(py_results)} Python i18n references")
    print()
    
    # Scan HTML templates
    print("Scanning HTML templates...")
    html_results = scan_directory(
        base_dir / 'templates',
        ['.html'],
        'html'
    )
    all_results.extend(html_results)
    print(f"Found {len(html_results)} HTML i18n references")
    print()
    
    # Generate output
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = base_dir / 'temp' / f'i18n_audit_{timestamp}.csv'
    output_file.parent.mkdir(exist_ok=True)
    
    print(f"Writing results to: {output_file}")
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['file', 'line', 'key', 'context'])
        writer.writeheader()
        writer.writerows(all_results)
    
    print()
    print("=" * 80)
    print("Summary:")
    print(f"  Total references found: {len(all_results)}")
    print(f"  JavaScript: {len(js_results)}")
    print(f"  Python: {len(py_results)}")
    print(f"  HTML: {len(html_results)}")
    print()
    print(f"Unique keys found: {len(set(r['key'] for r in all_results))}")
    print()
    print(f"Output saved to: {output_file}")
    print("=" * 80)
    
    # Also create a summary by key
    summary_file = base_dir / 'temp' / f'i18n_audit_summary_{timestamp}.txt'
    with open(summary_file, 'w', encoding='utf-8') as f:
        f.write("i18n Key Usage Summary\n")
        f.write("=" * 80 + "\n\n")
        
        # Group by key
        keys = {}
        for result in all_results:
            key = result['key']
            if key not in keys:
                keys[key] = []
            keys[key].append(result)
        
        # Sort and write
        for key in sorted(keys.keys()):
            f.write(f"\nKey: {key}\n")
            f.write(f"  Used {len(keys[key])} times\n")
            f.write(f"  Files:\n")
            files = set(r['file'] for r in keys[key])
            for file in sorted(files):
                count = sum(1 for r in keys[key] if r['file'] == file)
                rel_path = Path(file).relative_to(base_dir)
                f.write(f"    - {rel_path} ({count}x)\n")
    
    print(f"Summary saved to: {summary_file}")
    print()


if __name__ == '__main__':
    main()
