"""
CSV-based file I/O for observation data
Simpler alternative to binary format for initial development
"""

import csv
import re
from pathlib import Path
from typing import Dict, List, Tuple


# Canonical field order for observation CSV files.
# CSV column order: 23 columns. Note: 8HHHH is a combined field in CSV,
# but stored as separate HO/HU keys in the observation dict.
OBSERVATION_CSV_FIELDS = [
    'KK', 'O', 'JJ', 'MM', 'TT', 'g', 'ZS', 'ZM', 'd',
    'DD', 'N', 'C', 'c', 'EE', 'H', 'F', 'V', 'f', 'zz', 'GG',
    '8HHHH', 'sectors', 'remarks'
]

# CSV header line for observation files
OBSERVATION_CSV_HEADER = ','.join(OBSERVATION_CSV_FIELDS)

# Canonical field names for observation dicts (internal representation).
# Same as CSV but 8HHHH is split into HO and HU.
OBSERVATION_FIELDS = [
    'KK', 'O', 'JJ', 'MM', 'TT', 'g', 'ZS', 'ZM', 'd',
    'DD', 'N', 'C', 'c', 'EE', 'H', 'F', 'V', 'f', 'zz', 'GG',
    'HO', 'HU', 'sectors', 'remarks'
]


class ObservationCSV:
    """
    Handle CSV import/export of observations
    Format: KK,O,JJ,MM,TT,g,ZS,ZM,d,DD,N,C,c,EE,H,F,V,f,zz,GG,8HHHH,sectors,remarks
    Note: 8HHHH is a combined field (5 chars), not separate ho/hu
    
    Two CSV formats are supported:
    - Legacy format: Fixed positions with spaces (from original HALO program)
    - Modern format: Proper CSV with quoted remarks field
    """
    
    @staticmethod
    def _detect_format_and_encoding(filepath: Path) -> Tuple[bool, str]:
        """
        Detect if CSV file is in legacy format and determine encoding.
        Legacy format has a fixed 15-character sectors field (padded with spaces).
        Modern format has variable-length sectors (no padding).
        
        Args:
            filepath: Path to CSV file
            
        Returns:
            Tuple of (is_legacy, encoding)
        """
        def _check_legacy(content: str) -> bool:
            """Check if content is legacy format by looking for fixed 15-char sectors field."""
            lines = content.split('\n')
            for line in lines[:10]:
                parts = line.rstrip(',').split(',')
                if len(parts) > 21:
                    sectors_field = parts[21]
                    # Legacy format: sectors field is always exactly 15 chars
                    if len(sectors_field) == 15:
                        return True
                    else:
                        return False
            return False
        
        # Try UTF-8 first (modern format)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                chunk = f.read(50000)
                is_legacy = _check_legacy(chunk)
                return is_legacy, 'utf-8'
        except UnicodeDecodeError:
            pass
        
        # Try CP850 (DOS encoding for legacy files)
        try:
            with open(filepath, 'r', encoding='cp850') as f:
                chunk = f.read(50000)
                is_legacy = _check_legacy(chunk)
                return is_legacy, 'cp850'
        except Exception:
            return False, 'latin-1'
    
    @staticmethod
    def read_observations(filepath: Path) -> Tuple[List[Dict[str, str]], bool]:
        """
        Read observations from CSV file (legacy or modern format).
        
        Args:
            filepath: Path to CSV file
            
        Returns:
            Tuple of (observations list, needs_conversion flag)
            needs_conversion=True if file was in legacy format
        """
        is_legacy, encoding = ObservationCSV._detect_format_and_encoding(filepath)
        observations = []
        
        with open(filepath, 'r', encoding=encoding) as f:
            # Remove NULL characters that can cause PostgreSQL import issues
            content = f.read().replace('\x00', '')
            
            lines = content.splitlines()
            
            if is_legacy:
                # Legacy format: simple comma split (spaces between fields)
                for line in lines:
                    # Skip header line if present
                    if line.startswith('KK,'):
                        continue
                    parts = line.rstrip(',').split(',')
                    if len(parts) < 20:
                        continue
                    obs = ObservationCSV._parse_observation_parts(parts)
                    if obs:
                        observations.append(obs)
            else:
                # Modern format: proper CSV with quoted remarks
                reader = csv.reader(lines)
                for parts in reader:
                    # Skip header line if present
                    if parts and parts[0] == 'KK':
                        continue
                    if len(parts) < 20:
                        continue
                    obs = ObservationCSV._parse_observation_parts(parts)
                    if obs:
                        observations.append(obs)
        
        return observations, is_legacy
    
    @staticmethod
    def _norm(value: str) -> str:
        """Normalize a numeric CSV field: strip whitespace, convert '/' to
        empty, and remove leading zeros (e.g. '01' → '1', '0' stays '0')."""
        v = value.strip()
        if not v or v in ('/', '//'):
            return ''
        try:
            return str(int(v))
        except ValueError:
            return ''

    @staticmethod
    def _parse_observation_parts(parts: List[str]) -> Dict[str, str]:
        """Parse observation from CSV field parts into a Dict[str, str].
        
        Numeric fields are normalized: '/' → '' (empty), leading zeros
        stripped.  Text fields (sectors, remarks) are only whitespace-stripped.
        """
        _n = ObservationCSV._norm
        obs = {}
        obs['KK'] = _n(parts[0])
        obs['O'] = _n(parts[1])
        obs['JJ'] = _n(parts[2])
        obs['MM'] = _n(parts[3])
        obs['TT'] = _n(parts[4])
        obs['g'] = _n(parts[5])
        obs['ZS'] = _n(parts[6])
        obs['ZM'] = _n(parts[7])
        obs['d'] = _n(parts[8])
        obs['DD'] = _n(parts[9])
        obs['N'] = _n(parts[10])
        obs['C'] = _n(parts[11])
        obs['c'] = _n(parts[12])
        obs['EE'] = _n(parts[13])
        obs['H'] = _n(parts[14])
        obs['F'] = _n(parts[15])
        obs['V'] = _n(parts[16])
        obs['f'] = _n(parts[17])
        obs['zz'] = _n(parts[18])
        obs['GG'] = _n(parts[19])
        
        # Parse 8HHHH field into HO and HU
        ho_hu_field = parts[20].strip() if len(parts) > 20 else '/////'
        if len(ho_hu_field) >= 5:
            obs['HO'] = ho_hu_field[1:3].strip()
            obs['HU'] = ho_hu_field[3:5].strip()
        else:
            obs['HO'] = ''
            obs['HU'] = ''
        
        # Sectors and remarks — text fields, only strip whitespace
        obs['sectors'] = parts[21].strip() if len(parts) > 21 else ''
        # Remarks may contain commas — join all remaining parts back together
        obs['remarks'] = ','.join(parts[22:]).strip() if len(parts) > 22 else ''
        
        return obs

    @staticmethod
    def read_observations_from_stream(stream) -> List[Dict[str, str]]:
        """
        Read observations from in-memory text stream (CSV format).
        Uses _parse_observation_parts for consistency.
        """
        observations = []
        for line in stream:
            # Skip header line if present
            if line.startswith('KK,'):
                continue
            parts = line.rstrip(',\n').split(',')
            if len(parts) < 20:
                continue
            obs = ObservationCSV._parse_observation_parts(parts)
            if obs:
                observations.append(obs)
        return observations
    
    @staticmethod
    def write_observations(filepath: Path, observations: List[Dict[str, str]]) -> None:
        """
        Write observations to modern CSV format.
        
        Modern format:
        - No spaces between commas, no unnecessary spaces in fields
        - No leading zeros (except where semantically required)
        - Remarks field enclosed in double quotes when needed (handles embedded commas)
        - Standard CSV escaping
        - Values are stored as strings: empty = not observed, '/' = observed but not present
        
        Args:
            filepath: Path to CSV file
            observations: List of observation dicts
        """
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(OBSERVATION_CSV_FIELDS)
            
            for obs in observations:
                # Build 8HHHH field from HO and HU
                ho = obs.get('HO', '')
                hu = obs.get('HU', '')
                
                # Format HO: empty→'//', '//'→'//', else→zero-padded 2 digits
                if not ho or ho == '//':
                    ho_str = '//'
                else:
                    ho_str = ho.zfill(2)
                
                # Format HU: empty→'//', '//'→'//', else→zero-padded 2 digits
                if not hu or hu == '//':
                    hu_str = '//'
                else:
                    hu_str = hu.zfill(2)
                
                ho_hu_field = f'8{ho_str}{hu_str}'
                
                fields = [
                    obs.get('KK', ''),
                    obs.get('O', ''),
                    obs.get('JJ', ''),
                    obs.get('MM', ''),
                    obs.get('TT', ''),
                    obs.get('g', ''),
                    obs.get('ZS', ''),
                    obs.get('ZM', ''),
                    obs.get('d', ''),
                    obs.get('DD', ''),
                    obs.get('N', ''),
                    obs.get('C', ''),
                    obs.get('c', ''),
                    obs.get('EE', ''),
                    obs.get('H', ''),
                    obs.get('F', ''),
                    obs.get('V', ''),
                    obs.get('f', ''),
                    obs.get('zz', ''),
                    obs.get('GG', ''),
                    ho_hu_field,
                    obs.get('sectors', ''),
                    obs.get('remarks', '')
                ]
                
                writer.writerow(fields)
    
    @staticmethod
    def write_to_buffer(observations: List[Dict[str, str]], buffer) -> None:
        """
        Write observations to a string buffer in modern CSV format.
        Same as write_observations but writes to StringIO buffer instead of file.
        
        Args:
            observations: List of observation dicts
            buffer: StringIO buffer to write to
        """
        writer = csv.writer(buffer, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(OBSERVATION_CSV_FIELDS)
        
        for obs in observations:
            # Build 8HHHH field from HO and HU
            ho = obs.get('HO', '')
            hu = obs.get('HU', '')
            
            # Format HO: empty→'//', '//'→'//', else→zero-padded 2 digits
            if not ho or ho == '//':
                ho_str = '//'
            else:
                ho_str = ho.zfill(2)
            
            # Format HU: empty→'//', '//'→'//', else→zero-padded 2 digits
            if not hu or hu == '//':
                hu_str = '//'
            else:
                hu_str = hu.zfill(2)
            
            ho_hu_field = f'8{ho_str}{hu_str}'
            
            fields = [
                obs.get('KK', ''),
                obs.get('O', ''),
                obs.get('JJ', ''),
                obs.get('MM', ''),
                obs.get('TT', ''),
                obs.get('g', ''),
                obs.get('ZS', ''),
                obs.get('ZM', ''),
                obs.get('d', ''),
                obs.get('DD', ''),
                obs.get('N', ''),
                obs.get('C', ''),
                obs.get('c', ''),
                obs.get('EE', ''),
                obs.get('H', ''),
                obs.get('F', ''),
                obs.get('V', ''),
                obs.get('f', ''),
                obs.get('zz', ''),
                obs.get('GG', ''),
                ho_hu_field,
                obs.get('sectors', ''),
                obs.get('remarks', '')
            ]
            
            writer.writerow(fields)

