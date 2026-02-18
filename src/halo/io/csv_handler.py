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
    def _parse_int(value: str, default: int = -1, slash_as_not_present: bool = False) -> int:
        """
        Parse integer, handling special values.
        
        Standard behavior (for most fields):
        - '/' or ' ' or '' = not observed/unknown → -1
        
        Special behavior for d and 8HHHH (when slash_as_not_present=True):
        - '/' = observed but not present → 0 (no cirrus for d, not relevant for HO/HU)
        - ' ' or '' = not observed/unknown → -1
        
        Args:
            value: String value to parse
            default: Default value for empty/space (-1 by default)
            slash_as_not_present: If True, treat '/' as 0 (for d and 8HHHH fields only)
            
        Returns:
            Parsed integer or special value (-1 or 0)
        """
        value_stripped = value.strip()
        
        # Empty or space = unknown (always -1)
        if not value_stripped or value_stripped == ' ':
            return -1
        
        # Slash: either 0 (for d, 8HHHH) or -1 (for all other fields)
        # Also check for double slash '//' which is used in 8HHHH field
        if value_stripped == '/' or value_stripped == '//':
            return 0 if slash_as_not_present else -1
        
        try:
            return int(value_stripped)
        except ValueError:
            return default
    
    @staticmethod
    def _detect_format_and_encoding(filepath: Path) -> Tuple[bool, str]:
        """
        Detect if CSV file is in legacy format and determine encoding.
        Legacy format has spaces in the sectors field and uses CP850 (DOS).
        Modern format uses UTF-8.
        
        Args:
            filepath: Path to CSV file
            
        Returns:
            Tuple of (is_legacy, encoding)
        """
        # Try UTF-8 first (modern format) - read enough bytes to detect encoding issues
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                # Read first 50KB to detect encoding (should cover most files)
                chunk = f.read(50000)
                # Now check format in first few lines
                lines = chunk.split('\n')
                for line in lines[:10]:
                    parts = line.rstrip(',').split(',')
                    if len(parts) > 21:
                        sectors_field = parts[21]
                        if len(sectors_field) > len(sectors_field.strip()):
                            return True, 'utf-8'  # Legacy format with UTF-8
                        else:
                            return False, 'utf-8'  # Modern format with UTF-8
            return False, 'utf-8'  # Default to modern UTF-8
        except UnicodeDecodeError:
            # Not UTF-8, try CP850 (DOS encoding)
            pass
        
        # Try CP850 (DOS encoding for legacy files)
        try:
            with open(filepath, 'r', encoding='cp850') as f:
                # Check format in first few lines
                for i, line in enumerate(f):
                    if i >= 10:
                        break
                    parts = line.rstrip(',\n').split(',')
                    if len(parts) > 21:
                        sectors_field = parts[21]
                        if len(sectors_field) > len(sectors_field.strip()):
                            return True, 'cp850'  # Legacy format with DOS encoding
                        else:
                            return False, 'cp850'  # Modern format but CP850 encoding
            return True, 'cp850'  # Default to legacy CP850
        except Exception:
            # Fallback to latin-1 for other encodings
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
            
            if is_legacy:
                # Legacy format: simple comma split (spaces between fields)
                for line in content.splitlines():
                    parts = line.rstrip(',').split(',')
                    if len(parts) < 20:
                        continue
                    obs = ObservationCSV._parse_observation_parts(parts)
                    if obs:
                        observations.append(obs)
            else:
                # Modern format: proper CSV with quoted remarks
                reader = csv.reader(content.splitlines())
                for parts in reader:
                    if len(parts) < 20:
                        continue
                    obs = ObservationCSV._parse_observation_parts(parts)
                    if obs:
                        observations.append(obs)
        
        return observations, is_legacy
    
    @staticmethod
    def _parse_observation_parts(parts: List[str]) -> Dict[str, str]:
        """Parse observation from CSV field parts into a Dict[str, str]."""
        obs = {}
        obs['KK'] = parts[0].strip()
        obs['O'] = parts[1].strip()
        obs['JJ'] = parts[2].strip()
        obs['MM'] = parts[3].strip()
        obs['TT'] = parts[4].strip()
        obs['g'] = parts[5].strip()
        obs['ZS'] = parts[6].strip()
        obs['ZM'] = parts[7].strip()
        obs['d'] = parts[8].strip()
        obs['DD'] = parts[9].strip()
        obs['N'] = parts[10].strip()
        obs['C'] = parts[11].strip()
        obs['c'] = parts[12].strip()
        obs['EE'] = parts[13].strip()
        obs['H'] = parts[14].strip()
        obs['F'] = parts[15].strip()
        obs['V'] = parts[16].strip()
        obs['f'] = parts[17].strip()
        obs['zz'] = parts[18].strip()
        obs['GG'] = parts[19].strip()
        
        # Parse 8HHHH field into HO and HU
        ho_hu_field = parts[20].strip() if len(parts) > 20 else '/////'
        if len(ho_hu_field) >= 5:
            obs['HO'] = ho_hu_field[1:3].strip()
            obs['HU'] = ho_hu_field[3:5].strip()
        else:
            obs['HO'] = ''
            obs['HU'] = ''
        
        # Sectors and remarks
        obs['sectors'] = parts[21].strip() if len(parts) > 21 else ''
        obs['remarks'] = parts[22].strip() if len(parts) > 22 else ''
        
        return obs

    @staticmethod
    def read_observations_from_stream(stream) -> List[Dict[str, str]]:
        """
        Read observations from in-memory text stream (CSV format).
        Uses _parse_observation_parts for consistency.
        """
        observations = []
        for line in stream:
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
            
            for obs in observations:
                # Build 8HHHH field from HO and HU
                ho = obs.get('HO', '')
                hu = obs.get('HU', '')
                
                # Format HO: empty→'  ', '//'→'//', else→zero-padded 2 digits
                if not ho:
                    ho_str = '  '
                elif ho == '//':
                    ho_str = '//'
                else:
                    ho_str = ho.zfill(2)
                
                # Format HU: empty→'  ', '//'→'//', else→zero-padded 2 digits
                if not hu:
                    hu_str = '  '
                elif hu == '//':
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
        
        for obs in observations:
            # Build 8HHHH field from HO and HU
            ho = obs.get('HO', '')
            hu = obs.get('HU', '')
            
            # Format HO: empty→'  ', '//'→'//', else→zero-padded 2 digits
            if not ho:
                ho_str = '  '
            elif ho == '//':
                ho_str = '//'
            else:
                ho_str = ho.zfill(2)
            
            # Format HU: empty→'  ', '//'→'//', else→zero-padded 2 digits
            if not hu:
                hu_str = '  '
            elif hu == '//':
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

