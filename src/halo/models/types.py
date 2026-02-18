"""
Core data structures for HALO observations and observers
Translated from H_TYPES.PAS

DEPRECATED: The Observation dataclass below is no longer used.
All observation data is now represented as Dict[str, str] throughout
the codebase (io layer, routes, constants). This file is kept for
historical reference only. See Phase 1-3 refactoring (Feb 2026).
"""

import warnings
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Observation:
    """
    DEPRECATED - Use Dict[str, str] instead.
    
    Observation record (Beobachtg in Pascal)
    Represents a single halo observation
    
    This dataclass is no longer imported or used anywhere in the codebase.
    All observation handling now uses Dict[str, str] with string values.
    Kept for historical reference of the original field definitions.
    
    Field sizes maintained for binary compatibility:
    - Byte fields: 0-255
    - ShortInt fields: -128 to 127
    - String15: max 15 characters
    - String60: max 60 characters
    """
    # Version and observer
    vers: int = 25  # Byte - File format version (v2.5 = 25)
    KK: int = 0  # Byte - Observer ID (1-160)
    
    # Object and date
    O: int = 0  # ShortInt - Object type (1-5)
    JJ: int = 0  # ShortInt - Year (0-99, relative to 1900 or 2000)
    MM: int = 0  # ShortInt - Month (1-12)
    TT: int = 0  # ShortInt - Day (1-31)
    g: int = 0  # ShortInt - Observation location (0-2: main/secondary/other)
    
    # Time
    ZS: int = 0  # ShortInt - Hour (0-23)
    ZM: int = 0  # ShortInt - Minute (0-59)
    d: int = 0  # ShortInt - Origin/Density (0-7)
    
    # Conditions
    DD: int = 0  # ShortInt - Duration (×10 minutes)
    N: int = 0  # ShortInt - Cloud cover (0-10)
    C: int = 0  # ShortInt - Cirrus type
    c: int = 0  # ShortInt - Low clouds
    
    # Halo properties
    EE: int = 0  # ShortInt - Halo type (1-99)
    H: int = 0  # ShortInt - Brightness (-1 to 3)
    F: int = 0  # ShortInt - Color
    V: int = 0  # ShortInt - Completeness/Visibility
    
    # Additional properties
    f: int = 0  # ShortInt - Weather front
    zz: int = 0  # ShortInt - Precipitation
    GG: int = 0  # ShortInt - Geographic region (1-39)
    
    # Light pillar angles
    HO: int = 0  # ShortInt - Upper light pillar angle
    HU: int = 0  # ShortInt - Lower light pillar angle
    
    # Sectors (for circular halos)
    sectors: str = ""  # String15 - Sector information (max 15 chars)
    
    # Remarks
    remark_len: int = 0  # ShortInt - Length of remark
    remarks: str = ""  # String60 - Remark text (max 60 chars)
    
    def __post_init__(self):
        """Validate and truncate string fields to maintain binary compatibility"""
        if len(self.sectors) > 15:
            self.sectors = self.sectors[:15]
        if len(self.remarks) > 60:
            self.remarks = self.remarks[:60]
        self.remark_len = len(self.remarks)
