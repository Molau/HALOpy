"""
Observation File Operations (Layer 3a)

This module handles file-based storage operations for observations.
Pure I/O layer - no business logic, validation, or sorting.

Responsibilities:
- File CRUD: new, open, save, delete, rename
- Path management: data/, temp/, backup/
- Format delegation: Calls csv_handler.py for parsing
- Legacy format support: CP850 encoding, fixed positions

Layer Architecture:
- Layer 1: API Routes (routes.py, app.py)
- Layer 2: Data Management (observations.py) - storage-agnostic
- Layer 3a: File Storage (THIS MODULE) - file-specific I/O
- Layer 4: CSV Parser (csv_handler.py) - low-level parsing

Usage Example:
    from halo.io.observations_file import open_file, save_file
    from halo.io.observations import sort_observations
    
    # Layer 3a: File I/O
    observations, filepath = open_file("data.csv")
    
    # Layer 2: Business Logic
    observations = sort_observations(observations)
    
    # Layer 3a: Save
    save_file(observations, filepath)
"""

from pathlib import Path
from typing import List, Tuple, Optional
import os
import time
from datetime import datetime, timedelta

from halo.models.types import Observation
from halo.io.csv_handler import ObservationCSV


# ============================================================================
# Configuration
# ============================================================================

# Default directories (relative to project root)
DEFAULT_DATA_DIR = Path("data")
DEFAULT_TEMP_DIR = Path("temp")
TEMP_EXTENSION = "$$$"


# ============================================================================
# Path Utilities
# ============================================================================

def get_data_path(filename: Optional[str] = None) -> Path:
    """
    Get path to data/ directory or specific file within it.
    
    Args:
        filename: Optional filename within data/ directory
        
    Returns:
        Absolute path to data/ or data/filename
        
    Example:
        >>> get_data_path()  # data/
        >>> get_data_path("observations.csv")  # data/observations.csv
    """
    if filename:
        return DEFAULT_DATA_DIR / filename
    return DEFAULT_DATA_DIR


def get_temp_path(base_filename: str) -> Path:
    """
    Get path for temporary file (*.$$$ extension).
    
    Args:
        base_filename: Base name (e.g., "observations.csv")
        
    Returns:
        Path with $$$ extension in temp/ directory (e.g., "temp/observations.$$$")
        
    Example:
        >>> get_temp_path("data.csv")  # temp/data.$$$
    """
    base = Path(base_filename)
    stem = base.stem
    return DEFAULT_TEMP_DIR / f"{stem}.{TEMP_EXTENSION}"


def resolve_path(filename: str, base_dir: Optional[Path] = None) -> Path:
    """
    Resolve filename to absolute path.
    
    Args:
        filename: Filename or relative path
        base_dir: Base directory (default: data/)
        
    Returns:
        Absolute path to file
        
    Example:
        >>> resolve_path("test.csv")  # data/test.csv
        >>> resolve_path("/abs/path/test.csv")  # /abs/path/test.csv
    """
    path = Path(filename)
    
    # Already absolute
    if path.is_absolute():
        return path
    
    # Relative to base_dir
    if base_dir:
        return base_dir / path
    
    # Relative to data/
    return DEFAULT_DATA_DIR / path


# ============================================================================
# File Operations (Pure I/O)
# ============================================================================

def new_file(filename: str, base_dir: Optional[Path] = None) -> Path:
    """
    Create new empty observation file.
    
    Args:
        filename: Name of new file
        base_dir: Base directory (default: data/)
        
    Returns:
        Absolute path to created file
        
    Raises:
        FileExistsError: If file already exists
        
    Example:
        >>> path = new_file("new_observations.csv")
        >>> print(path)  # data/new_observations.csv
    """
    filepath = resolve_path(filename, base_dir)
    
    if filepath.exists():
        raise FileExistsError(f"File already exists: {filepath}")
    
    # Create parent directory if needed
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    # Create empty file
    filepath.write_text("", encoding="utf-8")
    
    return filepath


def open_file(filename: str, base_dir: Optional[Path] = None) -> Tuple[List[Observation], Path]:
    """
    Open observation file and read all observations.
    
    Args:
        filename: Name of file to open
        base_dir: Base directory (default: data/)
        
    Returns:
        Tuple of (observations, filepath)
        
    Raises:
        FileNotFoundError: If file does not exist
        
    Example:
        >>> observations, path = open_file("observations.csv")
        >>> print(f"Loaded {len(observations)} from {path}")
    """
    filepath = resolve_path(filename, base_dir)
    
    if not filepath.exists():
        raise FileNotFoundError(f"File not found: {filepath}")
    
    # Delegate to CSV parser (Layer 4)
    observations, needs_conversion = ObservationCSV.read_observations(str(filepath))
    
    return observations, filepath


def save_file(observations: List[Observation], filepath: Path) -> None:
    """
    Save observations to file (overwrite).
    
    Args:
        observations: List of observations to save
        filepath: Absolute path to file
        
    Raises:
        IOError: If write fails
        
    Example:
        >>> save_file(observations, Path("data/observations.csv"))
    """
    # Delegate to CSV writer (Layer 4)
    ObservationCSV.write_observations(str(filepath), observations)


def delete_file(filename: str, base_dir: Optional[Path] = None) -> bool:
    """
    Delete observation file.
    
    Args:
        filename: Name of file to delete
        base_dir: Base directory (default: data/)
        
    Returns:
        True if deleted, False if file didn't exist
        
    Example:
        >>> deleted = delete_file("old_observations.csv")
        >>> if deleted:
        ...     print("File deleted")
    """
    filepath = resolve_path(filename, base_dir)
    
    if not filepath.exists():
        return False
    
    filepath.unlink()
    return True


def rename_file(old_name: str, new_name: str, base_dir: Optional[Path] = None) -> Path:
    """
    Rename observation file.
    
    Args:
        old_name: Current filename
        new_name: New filename
        base_dir: Base directory (default: data/)
        
    Returns:
        Path to renamed file
        
    Raises:
        FileNotFoundError: If old file doesn't exist
        FileExistsError: If new file already exists
        
    Example:
        >>> new_path = rename_file("temp.csv", "observations.csv")
    """
    old_path = resolve_path(old_name, base_dir)
    new_path = resolve_path(new_name, base_dir)
    
    if not old_path.exists():
        raise FileNotFoundError(f"File not found: {old_path}")
    
    if new_path.exists():
        raise FileExistsError(f"File already exists: {new_path}")
    
    old_path.rename(new_path)
    return new_path


def file_exists(filename: str, base_dir: Optional[Path] = None) -> bool:
    """
    Check if observation file exists.
    
    Args:
        filename: Name of file to check
        base_dir: Base directory (default: data/)
        
    Returns:
        True if file exists
        
    Example:
        >>> if file_exists("observations.csv"):
        ...     print("File found")
    """
    filepath = resolve_path(filename, base_dir)
    return filepath.exists()


def list_files(base_dir: Optional[Path] = None, 
               extensions: Optional[List[str]] = None) -> List[str]:
    """
    List all observation files in directory.
    
    Args:
        base_dir: Base directory (default: data/)
        extensions: List of extensions to filter (e.g., [".csv", ".HAL"])
                   If None, lists all files
        
    Returns:
        List of filenames (without directory path)
        
    Example:
        >>> files = list_files()  # All files in data/
        >>> csv_files = list_files(extensions=[".csv"])
    """
    directory = base_dir if base_dir else DEFAULT_DATA_DIR
    
    if not directory.exists():
        return []
    
    files = []
    for item in directory.iterdir():
        if item.is_file():
            # Filter by extension if specified
            if extensions:
                if item.suffix.lower() in [ext.lower() for ext in extensions]:
                    files.append(item.name)
            else:
                files.append(item.name)
    
    return sorted(files)


# ============================================================================
# Temp & Backup Operations
# ============================================================================

def create_temp_backup(observations: List[Observation], base_filename: str) -> Path:
    """
    Create temporary backup file (*.$$$ extension).
    
    Args:
        observations: Observations to backup
        base_filename: Base filename (e.g., "observations.csv")
        
    Returns:
        Path to created temp file
        
    Example:
        >>> temp_path = create_temp_backup(observations, "data.csv")
        >>> print(temp_path)  # data/data.$$$
    """
    temp_path = get_temp_path(base_filename)
    
    # Create parent directory if needed
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Save to temp file
    ObservationCSV.write_observations(str(temp_path), observations)
    
    return temp_path


def restore_from_temp(base_filename: str) -> Optional[List[Observation]]:
    """
    Restore observations from temp file (*.$$$ extension).
    
    Args:
        base_filename: Base filename (e.g., "observations.csv")
        
    Returns:
        List of observations if temp file exists, None otherwise
        
    Example:
        >>> observations = restore_from_temp("data.csv")
        >>> if observations:
        ...     print(f"Restored {len(observations)} observations")
    """
    temp_path = get_temp_path(base_filename)
    
    if not temp_path.exists():
        return None
    
    observations, _ = ObservationCSV.read_observations(str(temp_path))
    return observations


def clean_temp_files(base_dir: Optional[Path] = None, max_age_hours: int = 24) -> int:
    """
    Clean old temporary files (*.$$$ extension).
    
    Args:
        base_dir: Base directory (default: data/)
        max_age_hours: Delete temp files older than this many hours
        
    Returns:
        Count of deleted files
        
    Example:
        >>> count = clean_temp_files(max_age_hours=24)
        >>> print(f"Deleted {count} old temp files")
    """
    directory = base_dir if base_dir else DEFAULT_DATA_DIR
    
    if not directory.exists():
        return 0
    
    cutoff_time = time.time() - (max_age_hours * 3600)
    deleted_count = 0
    
    for item in directory.glob(f"*.{TEMP_EXTENSION}"):
        if item.is_file():
            # Check file age
            file_mtime = item.stat().st_mtime
            if file_mtime < cutoff_time:
                item.unlink()
                deleted_count += 1
    
    return deleted_count


def delete_temp_file(base_filename: str) -> bool:
    """
    Delete specific temp file (*.$$$ extension).
    
    Args:
        base_filename: Base filename (e.g., "observations.csv")
        
    Returns:
        True if deleted, False if file didn't exist
        
    Example:
        >>> deleted = delete_temp_file("data.csv")
    """
    temp_path = get_temp_path(base_filename)
    
    if not temp_path.exists():
        return False
    
    temp_path.unlink()
    return True



