# Observations I/O Refactoring - Architektur-Konzept

## Datum: 2026-02-06

## Ziel

**Trennung von File-Operationen und logischen Daten-Operationen** zur Vorbereitung der Datenbank-Migration für Cloud-Mode.

---

## Architektur-Ebenen

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: API Routes (routes.py, app.py)                    │
│  - REST Endpoints                                           │
│  - Request/Response Handling                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Data Management (observations.py) - NEU           │
│  - CRUD für einzelne Beobachtungen                          │
│  - Collection Management (add, update, delete, filter)      │
│  - Format-Konvertierung & Validation                        │
│  - Sorting & Deduplication                                  │
│  - Storage-agnostisch (abstrahiert File vs. Database)       │
└─────────────────────────────────────────────────────────────┘
                            ↓
            ┌───────────────┴───────────────┐
            ↓                               ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│  Layer 3a: File Storage  │  │  Layer 3b: DB Storage    │
│  (observations_file.py)  │  │  (observations_db.py)    │
│  - NEW/OPEN/SAVE/DELETE  │  │  - Connect/Disconnect    │
│  - File path handling    │  │  - SQL Queries           │
│  - Legacy format support │  │  - Transactions          │
└──────────────────────────┘  └──────────────────────────┘
            ↓                               ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│  Layer 4a: CSV Parser    │  │  Layer 4b: ORM/Models    │
│  (csv_handler.py)        │  │  (SQLAlchemy models)     │
│  - Parse/Format CSV      │  │  - DB Schema             │
│  - Special values        │  │  - Relationships         │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Module-Struktur

```
src/halo/io/
├── __init__.py               # Exports (High-Level API)
├── observers.py              # ✓ Observer File I/O (bereits refactored)
│
├── observations.py           # ✓ COMPLETED: Data Management Layer (storage-agnostisch)
├── observations_file.py      # ✓ COMPLETED: File Storage Implementation
├── observations_db.py        # ZUKUNFT: Database Storage Implementation
│
└── csv_handler.py            # BLEIBT: Low-Level CSV Parser (keine Änderung)
```

---

## Layer 2: Data Management (`observations.py`)

### Verantwortlichkeiten:
- **Storage-agnostisch**: Weiß NICHT ob File oder Database
- **Business Logic**: Validierung, Sortierung, Duplikate
- **Format-Konvertierung**: Legacy → Modern
- **Collection Management**: Add, Update, Delete, Filter, Merge

### Funktionen:

```python
# ========================================
# Collection Management (storage-agnostisch)
# ========================================

def get_observation(key: ObservationKey) -> Optional[Observation]:
    """Get single observation by key (KK, O, JJ, MM, TT, EE, GG)."""
    
def add_observation(obs: Observation, collection: List[Observation]) -> List[Observation]:
    """Add observation to collection, return updated collection."""
    
def update_observation(key: ObservationKey, updated_obs: Observation, 
                       collection: List[Observation]) -> Tuple[bool, List[Observation]]:
    """Update observation in collection."""
    
def delete_observation(key: ObservationKey, 
                      collection: List[Observation]) -> Tuple[bool, List[Observation]]:
    """Delete observation from collection."""
    
def filter_observations(collection: List[Observation], 
                       criteria: FilterCriteria) -> List[Observation]:
    """Filter observations by criteria (observer, date range, halo type, etc.)."""
    
def sort_observations(collection: List[Observation]) -> List[Observation]:
    """Sort observations by HALO standard: J→M→T→ZS→ZM→K→E→gg."""
    
def merge_observations(current: List[Observation], 
                      new: List[Observation], 
                      skip_duplicates: bool = True) -> List[Observation]:
    """Merge two collections, optionally skip duplicates."""
    
def find_duplicates(collection: List[Observation]) -> List[Tuple[int, int]]:
    """Find duplicate observations (same key)."""

# ========================================
# Format Conversion (logical operation)
# ========================================

def convert_legacy_format(obs: Observation) -> Observation:
    """Convert observation from legacy to modern format."""
    
def needs_conversion(collection: List[Observation]) -> bool:
    """Check if collection contains legacy format observations."""

# ========================================
# Validation
# ========================================

def validate_observation(obs: Observation) -> Tuple[bool, List[str]]:
    """Validate observation, return (is_valid, error_messages)."""
    
def validate_collection(collection: List[Observation]) -> Dict[int, List[str]]:
    """Validate all observations, return index → errors mapping."""
```

---

## Layer 3a: File Storage (`observations_file.py`)

### Verantwortlichkeiten:
- **Nur File I/O**: NEW, OPEN, SAVE, DELETE, RENAME
- **Path Management**: data/, temp/, backup/
- **File Format Delegation**: Ruft csv_handler.py
- **Keine Business Logic**: Keine Validierung, Sortierung, etc.

### Funktionen:

```python
# ========================================
# File Operations (Pure I/O)
# ========================================

def new_file(filename: str, base_dir: Path = None) -> Path:
    """Create new empty observation file, return full path."""
    
def open_file(filename: str, base_dir: Path = None) -> Tuple[List[Observation], Path]:
    """Open observation file, return (observations, full_path)."""
    
def save_file(observations: List[Observation], filepath: Path) -> None:
    """Save observations to file (overwrite)."""
    
def delete_file(filename: str, base_dir: Path = None) -> bool:
    """Delete observation file."""
    
def rename_file(old_name: str, new_name: str, base_dir: Path = None) -> Path:
    """Rename observation file."""
    
def file_exists(filename: str, base_dir: Path = None) -> bool:
    """Check if observation file exists."""
    
def list_files(base_dir: Path = None, extensions: List[str] = None) -> List[str]:
    """List all observation files in directory."""

# ========================================
# Path Utilities
# ========================================

def get_data_path(filename: str = None) -> Path:
    """Get path to data/ directory or specific file."""
    
def get_temp_path(base_filename: str) -> Path:
    """Get path for temp file (*.$$$ extension)."""
    
def get_backup_path(base_filename: str) -> Path:
    """Get path for backup file (*.bak extension)."""

# ========================================
# Temp & Backup Operations
# ========================================

def create_temp_backup(observations: List[Observation], base_filename: str) -> Path:
    """Create temporary backup file, return path."""
    
def restore_from_temp(base_filename: str) -> Optional[List[Observation]]:
    """Restore observations from temp file."""
    
def clean_temp_files(max_age_hours: int = 24) -> int:
    """Clean old temp files, return count deleted."""
```

---

## Layer 3b: Database Storage (`observations_db.py`) - ZUKUNFT

### Verantwortlichkeiten:
- **Database Connection**: SQLite oder PostgreSQL
- **CRUD Operations**: Direkt auf DB
- **Transactions**: Atomare Operationen
- **Migration**: Von File zu DB

### Funktionen (Zukunft):

```python
def connect_database(connection_string: str) -> DatabaseConnection:
    """Connect to observation database."""
    
def get_observations(filters: dict = None) -> List[Observation]:
    """Get observations from database with optional filters."""
    
def save_observation(obs: Observation) -> int:
    """Save single observation, return ID."""
    
def update_observation(obs_id: int, obs: Observation) -> bool:
    """Update observation in database."""
    
def delete_observation(obs_id: int) -> bool:
    """Delete observation from database."""
    
def bulk_import(observations: List[Observation]) -> int:
    """Bulk import observations, return count."""
    
def migrate_from_file(filepath: Path) -> int:
    """Migrate observations from file to database."""
```

---

## Verwendung in routes.py

### Vorher (aktuell):
```python
# Alles vermischt - File I/O, Business Logic, Validation
observations, needs_conversion = ObservationCSV.read_observations(filepath)
if needs_conversion:
    ObservationCSV.write_observations(filepath, observations)
current_app.config['OBSERVATIONS'] = observations
current_app.config['LOADED_FILE'] = filename
```

### Nachher (refactored):

#### Local Mode (File-basiert):
```python
from halo.io.observations import sort_observations, needs_conversion, convert_legacy_format
from halo.io.observations_file import open_file, save_file

# Layer 3a: File I/O
observations, filepath = open_file(filename)

# Layer 2: Data Management
if needs_conversion(observations):
    observations = [convert_legacy_format(obs) for obs in observations]
    save_file(observations, filepath)  # Convert and save

observations = sort_observations(observations)
current_app.config['OBSERVATIONS'] = observations
current_app.config['LOADED_FILE'] = filename
```

#### Cloud Mode (Datenbank - Zukunft):
```python
from halo.io.observations import sort_observations, filter_observations
from halo.io.observations_db import connect_database, get_observations

# Layer 3b: Database I/O
db = connect_database(app.config['DATABASE_URL'])
observations = get_observations()  # Alle laden

# Layer 2: Data Management (gleicher Code!)
observations = sort_observations(observations)
current_app.config['OBSERVATIONS'] = observations
```

---

## Migration Cloud Mode: File → Database

### Schritt 1: Refactoring (jetzt)
- Erstelle Layer 2 (`observations.py`) - storage-agnostisch
- Erstelle Layer 3a (`observations_file.py`) - File-spezifisch
- Refactore routes.py und app.py

### Schritt 2: Database Layer (später)
- Erstelle Layer 3b (`observations_db.py`)
- SQLite oder PostgreSQL Schema
- Migration Tool: File → DB

### Schritt 3: Cloud Mode Update
- Config Flag: `USE_DATABASE = True/False`
- routes.py prüft Flag und wählt Layer 3a oder 3b
- Layer 2 bleibt unverändert (storage-agnostisch!)

---

## Vorteile dieser Architektur

### ✓ Separation of Concerns
- **Layer 2**: Business Logic - storage-unabhängig
- **Layer 3a/b**: Storage Implementation - austauschbar
- **Layer 4**: Format Parsing - wiederverwendbar

### ✓ Testbarkeit
- Layer 2 kann mit In-Memory Collections getestet werden
- Layer 3a/b können separat gemockt werden
- Keine File-I/O in Unit Tests für Business Logic

### ✓ Flexibilität
- Einfacher Wechsel File ↔ Database
- Hybrid Mode möglich (Cache + DB)
- Mehrere Backends gleichzeitig (File für Export, DB für Runtime)

### ✓ Wiederverwendbarkeit
- Layer 2 Funktionen in CLI, Web, Tests
- csv_handler.py kann für Export/Import weiter genutzt werden

### ✓ Zukunftssicher
- Einfache Migration zu PostgreSQL, MongoDB, etc.
- REST API kann direkt Layer 2 nutzen
- GraphQL könnte Layer 2 nutzen

---

## Refactoring-Plan

### Phase 1: Layer 2 - Data Management ✓ Starten
1. Erstelle `src/halo/io/observations.py`
2. Implementiere Collection Management Funktionen
3. Implementiere Format Conversion
4. Implementiere Validation

### Phase 2: Layer 3a - File Storage
1. Erstelle `src/halo/io/observations_file.py`
2. Extrahiere File Operations aus routes.py
3. Implementiere Path Utilities
4. Implementiere Temp/Backup Handling

### Phase 3: Refactor API Layer
1. Refactore `app.py` (Startup)
2. Refactore `routes.py` (16+ Stellen)
3. Update `__init__.py` Exports
4. Entferne duplizierten Code

### Phase 4: Testing
1. Unit Tests für Layer 2 (In-Memory)
2. Integration Tests für Layer 3a (File I/O)
3. End-to-End Tests für API

### Phase 5: Zukunft - Database Layer
1. Erstelle `src/halo/io/observations_db.py`
2. SQLAlchemy Models
3. Migration Tool
4. Config-basierter Backend-Switch

---

## Entscheidungspunkte

### 1. ObservationKey als eigener Type?
```python
@dataclass
class ObservationKey:
    """Unique key for observation: KK, O, JJ, MM, TT, EE, GG"""
    KK: int
    O: int
    JJ: int
    MM: int
    TT: int
    EE: int
    GG: int
```
**Pro**: Type-Safety, klare API  
**Contra**: Mehr Code, komplexere API

### 2. FilterCriteria als eigener Type?
```python
@dataclass
class FilterCriteria:
    observer_kk: Optional[int] = None
    year_range: Optional[Tuple[int, int]] = None
    month_range: Optional[Tuple[int, int]] = None
    halo_types: Optional[List[int]] = None
    # ...
```
**Pro**: Strukturiert, erweiterbar  
**Contra**: Mehr Boilerplate

### 3. Storage Interface/Protocol?
```python
class ObservationStorage(Protocol):
    def load(self, identifier: str) -> List[Observation]: ...
    def save(self, identifier: str, observations: List[Observation]) -> None: ...
```
**Pro**: Formal definiert, Type-Safe  
**Contra**: Mehr Abstraction Overhead

---

## Implementation Status

### ✓ Phase 1: Layer 2 (Data Management) - COMPLETED
- **Datum**: 2026-02-06
- **Modul**: `src/halo/io/observations.py` (700+ lines)
- **Tests**: `tests/io/test_observations_layer2.py` (12/12 passing)
- **Funktionen**:
  - Key Management: `make_observation_key()`, `find_observation()`, `find_observation_index()`
  - CRUD: `add_observation()`, `update_observation()`, `delete_observation()`
  - Collections: `sort_observations()`, `merge_observations()`, `remove_duplicates()`
  - Filtering: `filter_observations()` mit **kwargs (observer_kk, year, month, halo_type, custom_filter)
  - Statistics: `count_observations()`, `get_date_range()`, `get_observers()`
  - Validation: `validate_observation()`, `validate_collection()`
  - Format Conversion: `convert_legacy_observation()`, `convert_all_legacy_format()`
- **Entscheidungen**:
  - ObservationKey: 7-Tuple (KK, O, JJ, MM, TT, EE, GG)
  - FilterCriteria: **kwargs für Flexibilität
  - Storage Protocol: Duck-Typing für Einfachheit
  - Validation: Layer 2 (Business Logic)

### ✓ Phase 2: Layer 3a (File Operations) - COMPLETED
- **Datum**: 2026-02-06
- **Modul**: `src/halo/io/observations_file.py` (500+ lines)
- **Tests**: `tests/io/test_observations_file.py` (11/11 passing)
- **Funktionen**:
  - File CRUD: `new_file()`, `open_file()`, `save_file()`, `delete_file()`, `rename_file()`
  - File Queries: `file_exists()`, `list_files()`
  - Path Utilities: `get_data_path()`, `get_temp_path()`, `get_backup_path()`
  - Temp Operations: `create_temp_backup()`, `restore_from_temp()`, `clean_temp_files()`
  - Backup Operations: `create_backup()`, `restore_from_backup()`, `delete_backup()`
- **Design**:
  - Pure I/O Layer - keine Business Logic
  - Delegiert zu csv_handler.py für Parsing
  - Unterstützt temp files (*.$$$ extension)
  - Unterstützt backup files (*.bak extension)
  - Path resolution: Absolute oder relativ zu data/

### 🔮 Phase 3: Layer 3b (Database Operations) - TODO
- Für zukünftige Cloud-Migration
- SQLite oder PostgreSQL
- Analog zu Layer 3a, aber mit DB-Backend

---

## Storage-Specific Implementation Differences

### UPDATE Operation Strategy

**Layer 2 (storage-agnostic):**
```python
def update_observation(key, updated_obs, collection):
    # Works with in-memory list, no knowledge of File/DB
    # Simply replaces observation at matching index
```

**Layer 3a (File Storage) - DELETE + INSERT + Sort:**
```python
def update_observation_in_file(filepath, key, updated_obs):
    observations = load_observations_from_file(filepath)
    success, observations = delete_observation(key, observations)
    success, observations = add_observation(updated_obs, observations)
    observations = sort_observations(observations)  # CRITICAL: Re-sort!
    save_observations_to_file(filepath, observations)
```

**Rationale for File Storage:**
- CSV files store observations in sorted order (J→M→T→ZS→ZM→K→E→GG)
- If sort fields change (JJ, MM, TT, etc.), position in file must change
- Sorting is embedded in file structure, not handled by query
- DELETE + INSERT ensures correct position after update

**Layer 3b (Database Storage) - SQL UPDATE:**
```python
def update_observation_in_db(key, updated_obs):
    cursor.execute("""
        UPDATE observations 
        SET JJ=?, MM=?, TT=?, ZS=?, ZM=?, EE=?, GG=?, ... 
        WHERE KK=? AND O=? AND JJ=? AND MM=? AND TT=? AND EE=? AND GG=?
    """, (updated_obs.JJ, ..., *key))
```

**Rationale for Database Storage:**
1. ✅ **Efficient**: Single operation instead of DELETE + INSERT
2. ✅ **Atomic**: No race condition between DELETE and INSERT
3. ✅ **Preserves Metadata**: Auto-increment IDs, timestamps, etc. remain intact
4. ✅ **Sorting via SQL**: `ORDER BY JJ, MM, TT, ...` in query, not in storage
5. ✅ **Indexes**: Database indexes handle efficient sorting and lookups

**Key Insight:**
The same high-level operation (`update_observation`) has different optimal implementations depending on storage backend. This is exactly why Layer 2 is storage-agnostic—it provides a uniform interface while allowing Layer 3 to optimize for the specific storage technology.

### INSERT Operation Strategy

**Both Layer 3a and Layer 3b:**
- Simple append/INSERT without sorting
- Layer 3a sorts on SAVE (not on ADD)
- Layer 3b sorts on SELECT (via ORDER BY)

This design allows bulk operations to be efficient (add many, sort once).

---

## Nächster Schritt

✓ Layer 2 und Layer 3a sind implementiert und getestet!

**TODO - Phase 4: Integration in routes.py und app.py**
- Refactore bestehende Observation-Operationen
- Ersetze direkte ObservationCSV-Aufrufe durch io.observations + io.observations_file
- Teste End-to-End Funktionalität

**Zukünftig - Phase 5: Layer 3b (Database)**
- Cloud-Mode Unterstützung
- Migration Tool: File → Database
- Config Flag: `USE_DATABASE = True/False`

