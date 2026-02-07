"""
CSV-based file I/O for observation data
Simpler alternative to binary format for initial development
"""

import csv
import re
from pathlib import Path
from typing import List, Tuple
from ..models.types import Observation


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
    def read_observations(filepath: Path) -> Tuple[List[Observation], bool]:
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
    def _parse_observation_parts(parts: List[str]) -> Observation:
        """Parse observation from CSV field parts."""
        obs = Observation()
        obs.vers = 25
        obs.KK = ObservationCSV._parse_int(parts[0], -1)
        obs.O = ObservationCSV._parse_int(parts[1], -1)
        obs.JJ = ObservationCSV._parse_int(parts[2], -1)
        obs.MM = ObservationCSV._parse_int(parts[3], -1)
        obs.TT = ObservationCSV._parse_int(parts[4], -1)
        obs.g = ObservationCSV._parse_int(parts[5], -1)
        obs.ZS = ObservationCSV._parse_int(parts[6], -1)
        obs.ZM = ObservationCSV._parse_int(parts[7], -1)
        obs.d = ObservationCSV._parse_int(parts[8], -1, slash_as_not_present=True)  # d allows '/' → 0 (no cirrus)
        obs.DD = ObservationCSV._parse_int(parts[9], -1)
        obs.N = ObservationCSV._parse_int(parts[10], -1)
        obs.C = ObservationCSV._parse_int(parts[11], -1)
        obs.c = ObservationCSV._parse_int(parts[12], -1)
        obs.EE = ObservationCSV._parse_int(parts[13], -1)
        obs.H = ObservationCSV._parse_int(parts[14], -1)
        obs.F = ObservationCSV._parse_int(parts[15], -1)
        obs.V = ObservationCSV._parse_int(parts[16], -1)
        
        ff_str = parts[17].strip()
        obs.f = -1 if not ff_str or ff_str == '/' else ObservationCSV._parse_int(ff_str, -1)
        
        zz_str = parts[18].strip()
        obs.zz = -1 if not zz_str or zz_str == '/' else ObservationCSV._parse_int(zz_str, -1)
        
        obs.GG = ObservationCSV._parse_int(parts[19], -1)
        
        # Parse 8HHHH field
        ho_hu_field = parts[20] if len(parts) > 20 else "/////"
        if len(ho_hu_field) >= 5:
            ho_str = ho_hu_field[1:3]
            hu_str = ho_hu_field[3:5]
            obs.HO = ObservationCSV._parse_int(ho_str, -1, slash_as_not_present=True)  # HO allows '//' → 0 (not relevant)
            obs.HU = ObservationCSV._parse_int(hu_str, -1, slash_as_not_present=True)  # HU allows '//' → 0 (not relevant)
        else:
            obs.HO = -1
            obs.HU = -1
        
        # Sectors and remarks
        obs.sectors = parts[21].strip() if len(parts) > 21 else ""
        obs.remarks = parts[22].strip() if len(parts) > 22 else ""
        
        return obs

    @staticmethod
    def read_observations_from_stream(stream) -> List[Observation]:
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
    def write_observations(filepath: Path, observations: List[Observation]) -> None:
        """
        Write observations to modern CSV format.
        
        Modern format:
        - No spaces between commas, no unnecessary spaces in fields
        - No leading zeros (except where semantically required)
        - Remarks field enclosed in double quotes when needed (handles embedded commas)
        - Standard CSV escaping
        - Special values: -1 = not observed (empty/space), 0 = not present (/) for d/HO/HU
        
        Args:
            filepath: Path to CSV file
            observations: List of Observation objects
        """
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            
            for obs in observations:
                # Helper function to format field values
                def format_field(value):
                    """Format field: -1→empty, -2→'/', else→number"""
                    if value == -1:
                        return ''  # Not observed/unknown
                    elif value == -2:
                        return '/'  # Observed but not present
                    else:
                        return str(value)
                
                # Format fields with proper encoding of special values
                d_str = '/' if obs.d == 255 else format_field(obs.d)
                
                # Format 8HHHH field - special handling for double slash
                # Format: 8HHHH where first digit is always '8', not EE
                # -1 = not observed (spaces), 0 = not applicable (//), 1-90 = degrees
                
                # For HO and HU: -1→spaces, 0→'//', else→number with padding
                ho_str = ''
                if obs.HO == -1:
                    ho_str = '  '  # Not observed = spaces
                elif obs.HO == 0:
                    ho_str = '//'  # Not applicable
                else:
                    ho_str = str(obs.HO).zfill(2)  # Pad to 2 digits
                
                hu_str = ''
                if obs.HU == -1:
                    hu_str = '  '  # Not observed = spaces
                elif obs.HU == 0:
                    hu_str = '//'  # Not applicable
                else:
                    hu_str = str(obs.HU).zfill(2)  # Pad to 2 digits
                
                # Combine to 8HHHH field - always starts with '8'
                ho_hu_field = f'8{ho_str}{hu_str}'
                
                fields = [
                    str(obs.KK),
                    format_field(obs.O),
                    str(obs.JJ),
                    str(obs.MM),
                    str(obs.TT),
                    str(obs.g),
                    format_field(obs.ZS),
                    format_field(obs.ZM),
                    d_str,
                    format_field(obs.DD),
                    format_field(obs.N),
                    format_field(obs.C),
                    format_field(obs.c),
                    str(obs.EE),
                    format_field(obs.H),
                    format_field(obs.F),
                    format_field(obs.V),
                    format_field(obs.f),
                    format_field(obs.zz),
                    str(obs.GG),
                    ho_hu_field,
                    obs.sectors if obs.sectors else '',  # Empty if no sectors
                    obs.remarks  # csv.writer handles quoting automatically
                ]
                
                writer.writerow(fields)
    
    @staticmethod
    def write_to_buffer(observations: List[Observation], buffer) -> None:
        """
        Write observations to a string buffer in modern CSV format.
        Same as write_observations but writes to StringIO buffer instead of file.
        
        Args:
            observations: List of Observation objects
            buffer: StringIO buffer to write to
        """
        writer = csv.writer(buffer, quoting=csv.QUOTE_MINIMAL)
        
        for obs in observations:
            # Helper function to format field values
            def format_field(value):
                """Format field: -1→empty, -2→'/', else→number"""
                if value == -1:
                    return ''  # Not observed/unknown
                elif value == -2:
                    return '/'  # Observed but not present
                else:
                    return str(value)
            
            # Format fields with proper encoding of special values
            d_str = '/' if obs.d == 255 else format_field(obs.d)
            
            # For HO and HU: -1→spaces, 0→'//', else→number with padding
            ho_str = ''
            if obs.HO == -1:
                ho_str = '  '  # Not observed = spaces
            elif obs.HO == 0:
                ho_str = '//'  # Not applicable
            else:
                ho_str = str(obs.HO).zfill(2)  # Pad to 2 digits
            
            hu_str = ''
            if obs.HU == -1:
                hu_str = '  '  # Not observed = spaces
            elif obs.HU == 0:
                hu_str = '//'  # Not applicable
            else:
                hu_str = str(obs.HU).zfill(2)  # Pad to 2 digits
            
            # Combine to 8HHHH field - always starts with '8'
            ho_hu_field = f'8{ho_str}{hu_str}'
            
            fields = [
                str(obs.KK),
                format_field(obs.O),
                str(obs.JJ),
                str(obs.MM),
                str(obs.TT),
                str(obs.g),
                format_field(obs.ZS),
                format_field(obs.ZM),
                d_str,
                format_field(obs.DD),
                format_field(obs.N),
                format_field(obs.C),
                format_field(obs.c),
                str(obs.EE),
                format_field(obs.H),
                format_field(obs.F),
                format_field(obs.V),
                format_field(obs.f),
                format_field(obs.zz),
                str(obs.GG),
                ho_hu_field,
                obs.sectors if obs.sectors else '',  # Empty if no sectors
                obs.remarks  # csv.writer handles quoting automatically
            ]
            
            writer.writerow(fields)

