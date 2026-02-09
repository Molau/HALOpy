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
- **Business Logic**: Validierung, Duplikat-Prüfung
- **Format-Konvertierung**: Legacy → Modern
- **Collection Management**: Add, Update, Delete, Filter, Merge
- **Sorting**: Nur für In-Memory Collections (Tests) - Layer 3 sortiert beim I/O

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
    """Sort observations by HALO standard: J→M→T→ZS→ZM→K→E→gg.
    
    NOTE: Only needed for in-memory collections (tests, debugging).
    Layer 3a (file) sorts on save, Layer 3b (database) sorts via ORDER BY.
    """
    
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

## Layer 3b: Database Storage (`observations_db.py`) - IMPLEMENTATION PLAN

### Status: **PLANNED - 2026-02-09**

### Verantwortlichkeiten:
- **Pure SQL Operations**: CRUD direkt auf PostgreSQL
- **No Business Logic**: Keine Validierung, Sortierung, Duplikat-Prüfung
- **Transactions**: Atomare Operationen für Bulk-Import
- **SQL ORDER BY**: Database übernimmt Sortierung (nicht Python)

### Architektur-Prinzipien:

**WICHTIG:** Connection Management ist NICHT pro Modul!
- Connection-Funktionen sind **generisch** (wie i18n)
- Werden in separatem `db_connection.py` Modul implementiert
- Alle DB-Module nutzen das gleiche Connection-Modul

**Analog zu Layer 3a (File Storage):**
- Layer 3a hat KEINE business logic (nur I/O)
- Layer 3b hat KEINE business logic (nur SQL)
- Beide implementieren gleiche Schnittstelle für Layer 2

---

### Modul-Struktur:

```
src/halo/io/
├── db_connection.py          # NEU: Generische DB-Connection (shared)
│   ├── get_connection()      # Get psycopg2 connection
│   └── test_connection()     # Test if DB is reachable
│
├── observations_db.py         # NEU: Observations DB Operations
│   ├── load_all()
│   ├── load_filtered()
│   ├── save_one()            # INSERT (fails on conflict)
│   ├── update_one()          # UPDATE (proper SQL UPDATE, not delete+insert!)
│   ├── delete_one()
│   ├── save_many()           # Bulk INSERT (transaction)
│   └── count()
│
└── observers_db.py            # NEU: Observers DB Operations
    ├── load_all()
    ├── load_filtered()       # Filter by any field (kk, active, region, etc.)
    ├── save_one()
    ├── update_one()
    ├── delete_one()
    └── count()
```

---

### Shared Module: `db_connection.py`

**Zweck:** Generisches Connection-Management für alle DB-Operationen

**Funktionen:**

```python
def get_connection() -> psycopg2.connection:
    """
    Get PostgreSQL database connection.
    
    - Liest DATABASE_URL aus config.py
    - Gibt aktive psycopg2.connection zurück
    - Raises ValueError wenn DATABASE_URL nicht konfiguriert
    """

def test_connection() -> bool:
    """
    Test if database is reachable.
    
    - Führt SELECT 1 aus
    - Returns True bei Erfolg, False bei Fehler
    - Verwendet get_connection() intern
    """
```

---

### Module: `observations_db.py`

#### Mapping: Python ↔ PostgreSQL

**WICHTIG:** Database-Schema ist bereits festgelegt in `scripts/setup_database.sql`

```python
# Python Observation Object (uppercase fields):
obs = Observation(
    KK=44, O=1, JJ=25, MM=12, TT=31, g=0,
    ZS=15, ZM=30, d=4, DD=12, N=8, C=2, c=0,
    EE=22, H=2, F=1, V=2, f=0, zz=0, GG=26,
    HO=0, HU=0, sectors="3-4-5", remarks="Test"
)

# PostgreSQL Table (lowercase columns):
INSERT INTO observations (
    kk, o, jj, mm, tt, g,
    zs, zm, d, dd, n, c, cc,
    ee, h, f, v, ff, zz, gg,
    pillar, sectors, remarks
) VALUES (
    44, 1, 25, 12, 31, 0,
    15, 30, 4, 12, 8, 2, 0,
    22, 2, 1, 2, 0, 0, 26,
    '', '3-4-5', 'Test'
)
```

**Pillar Field Mapping:**
```python
# Python: Separate HO/HU fields
obs.HO = 15  # Upper angle
obs.HU = 20  # Lower angle

# PostgreSQL: Combined pillar string
pillar = f"8{obs.HO:02d}{obs.HU:02d}"  # "81520"
```

---

#### Funktionen: `observations_db.py`

**READ Operations:**

```python
def load_all() -> List[Observation]:
    """Load all observations, sorted by HALO standard (jj,mm,tt,zs,zm,kk,ee,gg)"""

def load_filtered(**filters) -> List[Observation]:
    """
    Load observations with filters (any HALO Key field).
    
    Supports: kk, o, jj, mm, tt, g, zs, zm, ee, gg, d, dd, n, c, cc, h, f, v, ff, zz
    Range filters: jj=(20,25), mm=(1,3)
    
    SQL: Dynamic WHERE clause + ORDER BY
    """

def count() -> int:
    """Count total observations - SELECT COUNT(*) FROM observations"""
```

**WRITE Operations:**

```python
def save_one(obs: Observation) -> bool:
    """
    Insert new observation (fails on duplicate key).
    
    Returns: True if inserted, False if conflict
    SQL: INSERT INTO observations ... (no ON CONFLICT)
    """

def update_one(key: Tuple, obs: Observation) -> bool:
    """
    Update existing observation (proper SQL UPDATE, not delete+insert).
    
    Args:
        key: 7-tuple (KK, O, JJ, MM, TT, EE, GG)
        obs: Updated observation
    
    Returns: True if updated, False if not found
    SQL: UPDATE observations SET ... WHERE kk=? AND o=? AND ...
    """

def delete_one(key: Tuple) -> bool:
    """
    Delete observation by key.
    
    Returns: True if deleted, False if not found
    SQL: DELETE FROM observations WHERE kk=? AND o=? AND ...
    """

def save_many(observations: List[Observation]) -> int:
    """
    Bulk insert with transaction (skips duplicates).
    
    Returns: Number of observations inserted
    SQL: BEGIN; INSERT ...; INSERT ...; COMMIT;
    """
```

**Helper Functions:**

```python
def _observation_to_tuple(obs: Observation) -> Tuple:
    """Convert Observation to tuple for SQL (uppercase→lowercase, HO/HU→pillar)"""

def _tuple_to_observation(row: Tuple) -> Observation:
    """Convert DB row to Observation (lowercase→uppercase, pillar→HO/HU)"""
```

---

### Module: `observers_db.py`

**READ Operations:**

```python
def load_all() -> List[List[str]]:
    """Load all observer records, sorted by kk, since"""

def load_filtered(**filters) -> List[List[str]]:
    """
    Load observer records with filters.
    
    Supports: kk, active, since, first_name, last_name, 
              primary_site, primary_region, secondary_site, secondary_region
    String fields: LIKE for partial matching
    
    SQL: Dynamic WHERE clause + ORDER BY kk, since
    """

def count() -> int:
    """Count total observer records - SELECT COUNT(*) FROM observers"""
```

**WRITE Operations:**

```python
def save_one(record: List[str]) -> bool:
    """
    Insert new observer record (21 fields).
    
    Returns: True if inserted, False if conflict (kk,since)
    SQL: INSERT INTO observers ...
    """

def update_one(kk: int, seit: str, record: List[str]) -> bool:
    """
    Update existing observer record.
    
    Returns: True if updated, False if not found
    SQL: UPDATE observers SET ... WHERE kk=? AND since=?
    """

def delete_one(kk: int, seit: str) -> bool:
    """
    Delete observer record.
    
    Returns: True if deleted, False if not found
    SQL: DELETE FROM observers WHERE kk=? AND since=?
    """
```

---

### Key Design Decisions:

#### 1. ✅ Shared Connection Module
- **ONE** `db_connection.py` for ALL database operations
- Avoids code duplication across observations_db and observers_db
- Consistent error handling and connection management

#### 2. ✅ Proper UPDATE Operations
- Database Layer 3b uses **SQL UPDATE** (not delete+insert)
- File Layer 3a uses delete+insert only because of sort-order requirement
- Database sorting via `ORDER BY` in queries, not in storage

#### 3. ✅ save_one() Fails on Conflict
- Matches file interface behavior
- No automatic UPSERT (use update_one() explicitly)
- Database UNIQUE constraint enforces uniqueness

#### 4. ✅ load_filtered() Supports All HALO Key Fields
- Generic **kwargs approach
- Builds dynamic WHERE clause
- Supports single values and ranges (tuples)

#### 5. ✅ No delete_all()
- Not needed for normal operations
- Admin can use SQL directly if needed
- Reduces risk of accidental data loss

#### 6. ✅ Schema Already Defined
- Uses existing `scripts/setup_database.sql`
- Lowercase column names in PostgreSQL
- Uppercase field names in Python Observation objects
- Helper functions handle mapping

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
from halo.io.observations import needs_conversion, convert_legacy_format
from halo.io.observations_file import open_file, save_file

# Layer 3a: File I/O (already sorted from file)
observations, filepath = open_file(filename)

# Layer 2: Data Management
if needs_conversion(observations):
    observations = [convert_legacy_format(obs) for obs in observations]
    save_file(observations, filepath)  # Convert and save (Layer 3a sorts on save)

# Observations are already sorted - no need to sort again
current_app.config['OBSERVATIONS'] = observations
current_app.config['LOADED_FILE'] = filename
```

#### Cloud Mode (Datenbank):
```python
from halo.io import observations_db

# Layer 3b: Database I/O (already sorted via SQL ORDER BY)
observations = observations_db.load_all()

# Observations are already sorted - no Layer 2 sorting needed
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

### 🔮 Phase 3: Layer 3b (Database Operations) - ✓ COMPLETED
- **Datum**: 2026-02-09
- **Module**: `db_connection.py`, `observations_db.py`, `observers_db.py`
- **Status**: ✅ Implementation abgeschlossen
- **Funktionen**:
  - **db_connection.py**: `get_connection()`, `test_connection()`
  - **observations_db.py**: `load_all()`, `load_filtered(**filters)`, `save_one()`, `update_one()`, `delete_one()`, `save_many()`, `count()`
  - **observers_db.py**: `load_all()`, `load_filtered(**filters)`, `save_one()`, `update_one()`, `delete_one()`, `count()`
- **Design**:
  - Shared connection module (nicht pro Modul)
  - Proper SQL UPDATE (nicht delete+insert)
  - save_one() fails on conflict (kein UPSERT)
  - load_filtered() mit **kwargs für alle Felder
  - Sortierung via SQL ORDER BY
  - Helper functions: _observation_to_tuple(), _tuple_to_observation()
- **Nächste Schritte**: Integration in routes.py für Cloud Mode

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

