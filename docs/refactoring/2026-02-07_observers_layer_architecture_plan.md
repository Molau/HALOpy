# Observer Module - 4-Layer Architecture Refactoring Plan

## Datum: 2026-02-07

## Status: PLANNING

## Ziel

**Einführung der 4-Layer-Architektur für Observer-Module** analog zu Observations, um Cloud-Migration (CSV → Database) zu ermöglichen.

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: API Routes (routes.py, app.py)                    │
│  - REST Endpoints für Observer-Verwaltung                   │
│  - Request/Response Handling                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Observer Management (observers.py) - NEU           │
│  - CRUD für einzelne Observer-Records                       │
│  - Collection Management (add, update, delete, filter)      │
│  - Sorting & Validation                                     │
│  - Storage-agnostisch (abstrahiert File vs. Database)       │
└─────────────────────────────────────────────────────────────┘
                            ↓
            ┌───────────────────────────────────┐
            ↓                                   ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│  Layer 3a: File Storage  │  │  Layer 3b: DB Storage    │
│  (observers_file.py)     │  │  (observers_db.py)       │
│  - CSV file I/O          │  │  - Database operations   │
│  - Path management       │  │  - SQL queries           │
└──────────────────────────┘  └──────────────────────────┘
            ↓                                   ↓
┌──────────────────────────┐  ┌──────────────────────────┐
│  Layer 4: CSV Parser     │  │  Layer 4: ORM Models     │
│  (csv module)            │  │  (SQLAlchemy)            │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Modul-Struktur

### AKTUELL (Post-2026-02-06):
```
src/halo/io/
├── __init__.py               # Exports
├── observers.py              # ✓ Alle Observer-Operationen (File + Logic gemischt)
├── observations.py           # ✓ Layer 2 (storage-agnostisch)
├── observations_file.py      # ✓ Layer 3a (File I/O)
└── csv_handler.py            # Low-level CSV Parser
```

### ZIEL:
```
src/halo/io/
├── __init__.py               # Exports
│
├── observers.py              # → Layer 2 (storage-agnostisch, Business Logic)
├── observers_file.py         # → Layer 3a (NEU: File Storage Implementation)
├── observers_db.py           # → Layer 3b (ZUKUNFT: Database Implementation)
│
├── observations.py           # ✓ Layer 2 (storage-agnostisch)
├── observations_file.py      # ✓ Layer 3a (File Storage)
├── observations_db.py        # ✓ Layer 3b (Database - Placeholder)
│
└── csv_handler.py            # Low-level CSV Parser
```

---

## Layer 2: Observer Management (observers.py) - Storage-agnostisch

### Verantwortlichkeiten:
- **Storage-agnostisch**: Weiß NICHT ob File oder Database
- **Business Logic**: Validierung, Sortierung, Duplikat-Prüfung
- **Collection Management**: Add, Update, Delete, Filter, Find

### Datenstruktur:
```python
# Observer Record = List[str] mit 14 Feldern:
# [0] KK        - Observer code (2 digits)
# [1] seit      - Valid from date (MM/JJ format)
# [2] VName     - First name
# [3] NName     - Last name
# [4] HBOrt     - Primary observation site
# [5] NBOrt     - Secondary observation site
# [6] Strasse   - Street address
# [7] PLZ       - Postal code
# [8] Ort       - City
# [9] Land      - Country
# [10] Breite   - Latitude (degrees)
# [11] Breite_Min - Latitude (minutes)
# [12] NS       - North/South
# [13] Laenge   - Longitude (degrees)
# ... (weitere Felder)

# ObserverKey = Tuple[str, str]  # (KK, seit)
```

### Funktionen (NEU - Layer 2):

```python
# ========================================
# Key Management
# ========================================

def make_observer_key(kk: str, seit: str) -> Tuple[str, str]:
    """Create observer key tuple (KK, seit)."""
    
def normalize_kk(kk: str | int) -> str:
    """Normalize KK to 2-digit string (e.g., '04', '44')."""

# ========================================
# Collection Management (storage-agnostisch)
# ========================================

def get_observer_record(key: Tuple[str, str], collection: List[List[str]]) -> Optional[List[str]]:
    """Get single observer record by key (KK, seit)."""
    
def find_observer_records(kk: str, collection: List[List[str]]) -> List[List[str]]:
    """Find all records for observer KK."""
    
def add_observer_record(record: List[str], collection: List[List[str]]) -> List[List[str]]:
    """Add observer record to collection, return updated collection."""
    
def update_observer_record(key: Tuple[str, str], updated_fields: Dict[int, str], 
                          collection: List[List[str]]) -> Tuple[bool, List[List[str]]]:
    """Update observer record in collection."""
    
def delete_observer_record(key: Tuple[str, str], collection: List[List[str]]) -> Tuple[bool, List[List[str]]]:
    """Delete observer record from collection."""
    
def delete_all_observer_records(kk: str, collection: List[List[str]]) -> Tuple[int, List[List[str]]]:
    """Delete all records for observer KK."""

# ========================================
# Sorting
# ========================================

def sort_observers(collection: List[List[str]]) -> List[List[str]]:
    """Sort observers by KK (string), then seit (chronological YYYYMM)."""
    
def _observer_sort_key(record: List[str]) -> Tuple[str, int]:
    """Generate sort key for observer record."""

# ========================================
# Validation
# ========================================

def validate_observer_record(record: List[str]) -> Tuple[bool, List[str]]:
    """Validate observer record, return (is_valid, error_messages)."""
    
def validate_kk(kk: str) -> bool:
    """Validate observer code (2 digits, 01-99)."""
    
def validate_seit(seit: str) -> bool:
    """Validate seit date (MM/JJ format)."""

# ========================================
# Filtering
# ========================================

def filter_active_observers(collection: List[List[str]], reference_date: str = None) -> List[List[str]]:
    """Filter for active observers at reference date (default: today)."""
    
def get_latest_record_per_observer(collection: List[List[str]]) -> Dict[str, List[str]]:
    """Get latest record for each observer KK."""
```

---

## Layer 3a: File Storage (observers_file.py) - NEU

### Verantwortlichkeiten:
- **Nur File I/O**: OPEN, SAVE, DELETE
- **Path Management**: resources/
- **CSV Format Handling**: UTF-8 encoding
- **Keine Business Logic**: Keine Validierung, Sortierung, etc.

### Wichtige Unterscheidung zu Layer 3b (Database):
- **File Storage**: MUSS sortieren vor dem Speichern (CSV hat keine inhärente Sortierung)
- **Database Storage**: KEIN Sortieren nötig (SQL ORDER BY macht das bei Abfragen)
- **Layer 2 sort_observers()**: Bleibt relevant für In-Memory-Listen und File Storage

### Funktionen (NEU - Layer 3a):

```python
# ========================================
# File Operations (Pure I/O)
# ========================================

def open_file(file_path: Path = None) -> Tuple[List[List[str]], Path]:
    """Open observer file, return (records, full_path)."""
    
def save_file(records: List[List[str]], file_path: Path = None) -> None:
    """Save observer records to file (overwrite)."""
    
def file_exists(file_path: Path = None) -> bool:
    """Check if observer file exists."""

# ========================================
# Path Utilities
# ========================================

def get_default_path() -> Path:
    """Get path to default halobeo.csv file."""
    
def get_backup_path() -> Path:
    """Get path for backup file (halobeo.bak)."""

# ========================================
# Backup Operations
# ========================================

def create_backup(records: List[List[str]]) -> Path:
    """Create backup file, return path."""
    
def restore_from_backup() -> Optional[List[List[str]]]:
    """Restore observers from backup file."""
```

---

## Layer 3b: Database Storage (observers_db.py) - ZUKUNFT

### Verantwortlichkeiten:
- **Database Connection**: SQLite oder PostgreSQL
- **CRUD Operations**: Direkt auf DB
- **Query Optimization**: Index auf (KK, seit)
- **KEIN Sortieren**: SQL ORDER BY macht das bei SELECT-Queries

### Wichtig:
- **save_to_db()** braucht KEIN sort_observers() davor!
- **load_from_db()** macht: `SELECT * FROM observers ORDER BY kk, seit_numeric`
- Sortierung ist nur für File Storage (Layer 3a) relevant

### Schema (ZUKUNFT):
```sql
CREATE TABLE observers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kk TEXT NOT NULL,
    seit TEXT NOT NULL,
    vname TEXT NOT NULL,
    nname TEXT NOT NULL,
    hbort TEXT,
    nbort TEXT,
    strasse TEXT,
    plz TEXT,
    ort TEXT,
    land TEXT,
    breite INTEGER,
    breite_min INTEGER,
    ns TEXT,
    laenge INTEGER,
    laenge_min INTEGER,
    ew TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(kk, seit)
);

CREATE INDEX idx_observers_kk ON observers(kk);
CREATE INDEX idx_observers_seit ON observers(seit);
```

### Funktionen (ZUKUNFT):
```python
def connect_database(connection_string: str) -> DatabaseConnection:
    """Connect to observer database."""
    
def get_observers(filters: dict = None) -> List[List[str]]:
    """Get observers from database with optional filters."""
    
def save_observer(record: List[str]) -> int:
    """Save single observer record, return ID."""
    
def update_observer(key: Tuple[str, str], fields: Dict[int, str]) -> bool:
    """Update observer in database."""
    
def delete_observer(key: Tuple[str, str]) -> bool:
    """Delete observer from database."""
```

---

## Refactoring-Schritte (Konkret)

### Phase 1: Layer 2 - Observer Management (storage-agnostisch)

**Ziel**: Bestehende `observers.py` refactoren - Business Logic von File I/O trennen

**Schritte**:
1. ✓ **Analysiere bestehende Funktionen** in `src/halo/io/observers.py`
   - Identifiziere File I/O Operationen (zu Layer 3a)
   - Identifiziere Business Logic (bleibt Layer 2)

2. ✓ **Erstelle neue Funktionen** (storage-agnostisch):
   - `make_observer_key()` - Key-Generierung
   - `normalize_kk()` - KK-Normalisierung
   - `get_observer_record()` - Single record lookup
   - `add_observer_record()` - Add ohne File I/O
   - `update_observer_record()` - Update ohne File I/O
   - `delete_observer_record()` - Delete ohne File I/O
   - `sort_observers()` - Collection sorting
   - `validate_observer_record()` - Validation

3. ✓ **Refactore bestehende Funktionen**:
   - `find_observer_records()` - Entferne File I/O, arbeite mit Collection
   - Entferne alle direkten `csv.reader()` / `csv.writer()` Aufrufe

4. ✓ **Tests erstellen**: `tests/io/test_observers_layer2.py`
   - Unit Tests mit In-Memory Collections
   - Keine File I/O in Tests

**Dateien**:
- Modifiziert: `src/halo/io/observers.py` (Layer 2 Funktionen)
- Neu: `tests/io/test_observers_layer2.py`

---

### Phase 2: Layer 3a - File Storage Implementation

**Ziel**: Neue Datei `observers_file.py` mit reinen File I/O Operationen

**Schritte**:
1. ✓ **Erstelle** `src/halo/io/observers_file.py`
   
2. ✓ **Implementiere File Operations**:
   - `open_file()` - CSV lesen
   - `save_file()` - CSV schreiben
   - `get_default_path()` - Path zu halobeo.csv
   - `create_backup()` - Backup erstellen
   - `restore_from_backup()` - Backup wiederherstellen

3. ✓ **Extrahiere File I/O** aus `observers.py`:
   - Move `load_observers()` → `observers_file.open_file()`
   - Move `save_observers()` → `observers_file.save_file()`
   - Move `get_observers_path()` → `observers_file.get_default_path()`

4. ✓ **Tests erstellen**: `tests/io/test_observers_file.py`
   - Integration Tests mit temporären Dateien
   - Test CSV read/write/backup

**Dateien**:
- Neu: `src/halo/io/observers_file.py`
- Modifiziert: `src/halo/io/observers.py` (entferne File I/O)
- Neu: `tests/io/test_observers_file.py`

---

### Phase 3: API Layer Refactoring

**Ziel**: `routes.py` und `app.py` verwenden Layer 2 + Layer 3a

**Schritte**:
1. ✓ **Refactore app.py** (Startup):
   ```python
   # VORHER (aktuell):
   from halo.io.observers import load_observers
   app.config['OBSERVERS'] = load_observers()
   
   # NACHHER:
   from halo.io import observers_file
   from halo.io.observers import sort_observers
   records, _ = observers_file.open_file()
   records = sort_observers(records)
   app.config['OBSERVERS'] = records
   ```

2. ✓ **Refactore routes.py** (Upload/Download/CRUD):
   ```python
   # VORHER (aktuell):
   from halo.io.observers import load_observers, save_observers
   existing = load_observers()
   # ... logic ...
   save_observers(updated)
   
   # NACHHER:
   from halo.io import observers_file
   from halo.io.observers import add_observer_record, sort_observers
   existing, _ = observers_file.open_file()
   # ... logic with Layer 2 functions ...
   updated = sort_observers(updated)
   observers_file.save_file(updated)
   ```

3. ✓ **Update alle CRUD Endpoints**:
   - `/observers/upload` - Layer 3a für I/O, Layer 2 für Logic
   - `/observers/download` - Layer 3a für I/O
   - `/api/observers` (GET/POST/PUT/DELETE) - Layer 2 + 3a

4. ✓ **Tests aktualisieren**: Bestehende Tests müssen weiterhin funktionieren

**Dateien**:
- Modifiziert: `src/halo/web/app.py`
- Modifiziert: `src/halo/api/routes.py`

---

### Phase 4: Testing & Validation

**Ziel**: Vollständige Test-Coverage für alle Layer

**Schritte**:
1. ✓ **Layer 2 Unit Tests** (In-Memory):
   - Collection operations (add, update, delete, find)
   - Sorting algorithm
   - Validation logic
   - Key generation/normalization

2. ✓ **Layer 3a Integration Tests** (File I/O):
   - CSV read/write
   - Backup/restore
   - Path management
   - Error handling (file not found, write errors)

3. ✓ **End-to-End Tests** (API):
   - Full workflow: upload → modify → download
   - Persistence across restarts
   - Error scenarios

4. ✓ **Performance Tests**:
   - Large file handling (1000+ observer records)
   - Concurrent access

**Dateien**:
- Neu: `tests/io/test_observers_layer2.py`
- Neu: `tests/io/test_observers_file.py`
- Erweitert: `tests/api/test_observers.py`

---

### Phase 5: Dokumentation & Cleanup

**Ziel**: Vollständige Dokumentation der neuen Architektur

**Schritte**:
1. ✓ **Update Documentation**:
   - README für Observer-Modul
   - API-Dokumentation
   - Architektur-Diagramme

2. ✓ **Code Cleanup**:
   - Entferne deprecated Funktionen
   - Konsistente Naming Conventions
   - Docstrings für alle Public Functions

3. ✓ **Migration Guide**:
   - Für Entwickler: Wie man neue Observer-Features hinzufügt
   - Cloud-Migration: Wie Layer 3b implementiert wird

**Dateien**:
- Update: `docs/refactoring/2026-02-07_observers_layer_architecture.md`
- Neu: `docs/observers_api.md`

---

## Wichtige Unterschiede zu Observations

### Datenstruktur:
- **Observations**: `Observation` dataclass mit 23 Feldern
- **Observers**: `List[str]` mit 14+ Feldern (CSV-Row)

### Key Struktur:
- **Observations**: 7-Tuple `(KK, O, JJ, MM, TT, EE, GG)`
- **Observers**: 2-Tuple `(KK, seit)` - KK ist String!

### Sorting:
- **Observations**: 8-level sort (J→M→T→ZS→ZM→K→E→GG)
- **Observers**: 2-level sort (KK string, seit chronological)

### Multiple Records:
- **Observations**: Eindeutig pro Key (keine Duplikate)
- **Observers**: Mehrere Records pro KK (verschiedene seit-Daten)

### File Location:
- **Observations**: `data/` directory
- **Observers**: `resources/` directory

---

## Timeline

### Woche 1 (2026-02-07 - 2026-02-14):
- ✓ Phase 1: Layer 2 Implementation (3 Tage)
- ✓ Phase 2: Layer 3a Implementation (2 Tage)

### Woche 2 (2026-02-15 - 2026-02-21):
- ✓ Phase 3: API Refactoring (3 Tage)
- ✓ Phase 4: Testing (3 Tage)

### Woche 3 (2026-02-22 - 2026-02-28):
- ✓ Phase 5: Documentation & Cleanup (2 Tage)
- ✓ Code Review & Merge

---

## Erfolgskriterien

### Funktional:
- ✅ Alle bestehenden Observer-Features funktionieren unverändert
- ✅ Keine Breaking Changes für Frontend
- ✅ Performance nicht schlechter als vorher

### Architektur:
- ✅ Layer 2 ist 100% storage-agnostisch
- ✅ Layer 3a enthält KEINE Business Logic
- ✅ Klare Trennung zwischen Layers

### Testing:
- ✅ Unit Tests für Layer 2 (In-Memory)
- ✅ Integration Tests für Layer 3a (File I/O)
- ✅ End-to-End Tests für API

### Zukunftssicherheit:
- ✅ Layer 3b (Database) kann ohne Änderung an Layer 2 implementiert werden
- ✅ Config-basierter Backend-Switch möglich

---

## Risiken & Mitigationen

### Risiko 1: Breaking Changes
- **Mitigation**: Schrittweise Migration, alte Funktionen als deprecated markieren

### Risiko 2: Performance-Degradation
- **Mitigation**: Performance-Tests vor/nach Refactoring

### Risiko 3: Data Loss bei Migration
- **Mitigation**: Automatische Backups vor jedem Write

### Risiko 4: Komplexität
- **Mitigation**: Klare Layer-Grenzen, gute Dokumentation

---

## ✅ Entscheidungen (2026-02-07)

1. **Observer-Datenstruktur**: ✅ **List[str]** beibehalten
   - **Rationale**: Effizienter, weniger Konvertierungs-Overhead, direktes CSV-Mapping
   - Kein dataclass nötig - einfache Struktur, keine komplexe Validierung
   - Type hints bleiben: `List[str]` ist ausreichend typsicher

2. **KK Format**: ✅ **String mit Leading Zero** ("04", "44")
   - **Rationale**: Keine mathematischen Operationen nötig (außer Sortierung)
   - CSV speichert bereits als String mit Leading Zero
   - String-Vergleich für Sortierung ist ausreichend

3. **seit-Format**: ✅ **"MM/JJ" String** beibehalten
   - **Rationale**: Wird so in CSV gespeichert, keine Konvertierung nötig
   - Parsing nur für chronologische Sortierung (JJ < 50 → 20YY, ≥ 50 → 19YY)

4. **Backup-Strategie**: ✅ **halobeo.csv → halobeo.bak vor Änderungen**
   - **Rationale**: Keine automatischen Backups bei jedem Save (sofortiges Speichern)

5. **Sortierung**: ✅ **NUR für File Storage (Layer 3a) erforderlich**
   - **Rationale**: CSV hat keine inhärente Sortierung → muss vor Save sortieren
   - **Layer 3b (Database)**: KEIN Sortieren nötig - SQL ORDER BY bei SELECT
   - **Layer 2 sort_observers()**: Bleibt nützlich für In-Memory-Listen und File Prep
   - **Best Practice**: API Routes sortieren vor observer_file.save_file()

---

## Best Practices

### ✅ DO:
1. **File Storage (Layer 3a)**:
   ```python
   # ALWAYS sort before saving to CSV
   observers = observer_logic.sort_observers(observers)
   observer_file.save_file(observers)
   ```

2. **Database Storage (Layer 3b - future)**:
   ```python
   # NO sorting needed - database handles it
   observers_db.save_to_db(observers)
   # SELECT * FROM observers ORDER BY kk, seit_numeric
   ```

3. **In-Memory Operations**:
   ```python
   # Use Layer 2 for filtering/finding
   active = observer_logic.filter_active_observers(observers)
   kk44 = observer_logic.find_observer_records('44', observers)
   ```

### ❌ DON'T:
1. **NEVER** sort in Layer 3b (Database):
   ```python
   # ❌ WRONG - database does this automatically
   observers = observer_logic.sort_observers(observers)
   observers_db.save_to_db(observers)  # Wasted CPU cycles
   ```

2. **NEVER** skip sorting for Layer 3a (File):
   ```python
   # ❌ WRONG - CSV will be unsorted
   observer_file.save_file(observers)  # Missing sort!
   ```

3. **NEVER** put business logic in Layer 3:
   ```python
   # ❌ WRONG - validation belongs in Layer 2
   def save_file(records):
       if not validate_observer(records[0]):  # NO!
           raise ValueError()
   ```

---

## Zusammenfassung

**Warum diese Architektur?**
- **Zukunftssicherheit**: Cloud-Migration ohne Layer 2 Änderungen
- **Klarheit**: Jeder Layer hat genau EINE Verantwortung
- **Testbarkeit**: Layer 2 Tests funktionieren für File UND Database
- **Performance**: Database braucht kein Sortieren, File Storage macht es explizit

**Key Insight**:
> Sortierung ist ein **File-Storage-spezifisches Problem**, KEIN Business-Logic-Problem.
> → sort_observers() in Layer 2 ist ein **Utility** für File Storage, nicht Teil der Core Logic.
   - Vor Änderungen: Rename/Copy halobeo.csv → halobeo.bak
   - Kein Retention-System nötig (nur eine Backup-Generation)

---

## Nächste Schritte

1. ✅ Review dieses Plans mit Team
2. ✅ Entscheidungen zu offenen Fragen
3. ✅ Start Phase 1: Layer 2 Implementation
