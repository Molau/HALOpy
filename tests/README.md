# HALOpy Test Suite

Systematische Tests für HALOpy-Komponenten, organisiert nach Modulstruktur.

## Verzeichnisstruktur

```
tests/
├── README.md              # Diese Datei - Übersicht und Anleitung
├── io/                    # Tests für I/O-Module (Layer 2, 3a, 3b)
│   ├── test_observers.py              # Observer-Dateioperationen
│   ├── test_observations_layer2.py    # Data Management (storage-agnostic)
│   ├── test_observations_file.py      # File Operations (Layer 3a) ✓ COMPLETED
│   └── test_observations_db.py        # Database Operations (Layer 3b) - TODO
├── models/                # Tests für Datenmodelle - TODO
├── services/              # Tests für Business Logic - TODO
└── api/                   # Tests für REST API Endpoints - TODO
```

## Layer-Architektur

Die Tests folgen der 4-Layer-Architektur für Observation-Handling:

### Layer 1: API Layer (routes.py)
- REST Endpoints
- Request/Response Handling
- **Tests**: `api/test_routes.py` (TODO)

### Layer 2: Data Management (observations.py)
- **Storage-agnostisch**: Arbeitet nur mit `List[Observation]` im Speicher
- **Keine I/O**: Keine File- oder Datenbankoperationen
- **Funktionen**:
  - Key Management: `make_observation_key()`, `find_observation()`
  - CRUD: `add_observation()`, `update_observation()`, `delete_observation()`
  - Collections: `sort_observations()`, `merge_observations()`, `remove_duplicates()`
  - Filtering: `filter_observations()` mit flexiblen **kwargs
  - Statistics: `count_observations()`, `get_date_range()`, `get_observers()`
  - Validation: `validate_observation()`, `validate_collection()`
  - Format Conversion: `convert_legacy_observation()`, `convert_all_legacy_format()`
- **Tests**: `io/test_observations_layer2.py` ✓ COMPLETED
- **Wiederverwendbarkeit**: 100% - identische Tests für File und DB, da keine I/O-Abhängigkeiten

### Layer 3a: File Operations (observations_file.py)
- **File I/O**: CSV-Dateioperationen
- **Funktionen**:
  - File CRUD: `new_file()`, `open_file()`, `save_file()`, `delete_file()`, `rename_file()`
  - Path utilities: `get_data_path()`, `get_temp_path()`, `get_backup_path()`
  - Temp/Backup: `create_temp_backup()`, `restore_from_temp()`, `clean_temp_files()`
- **Tests**: `io/test_observations_file.py` ✓ COMPLETED
- **Wiederverwendbarkeit**: 0% - spezifisch für Dateioperationen

### Layer 3b: Database Operations (observations_db.py)
- **Database I/O**: SQL-Datenbankoperationen für Cloud-Modus
- **Funktionen**: Analog zu Layer 3a, aber mit DB-Backend
- **Tests**: `io/test_observations_db.py` (TODO)
- **Wiederverwendbarkeit**: 0% - spezifisch für Datenbankoperationen

### Layer 4: Format Parser (csv_handler.py)
- **CSV Parsing**: Low-level CSV-Lesen/-Schreiben
- **Tests**: TODO

## Testausführung

### Alle Tests ausführen
```powershell
# Alle Tests im Verzeichnis
python -m pytest tests/

# Mit ausführlicher Ausgabe
python -m pytest tests/ -v

# Mit Coverage
python -m pytest tests/ --cov=src/halo
```

### Einzelne Testdateien ausführen
```powershell
# Layer 2 (Data Management)
python tests/io/test_observations_layer2.py

# Observer-Operationen
python tests/io/test_observers.py

# Später: File Operations
python tests/io/test_observations_file.py

# Später: Database Operations
python tests/io/test_observations_db.py
```

## Testprinzipien

### 1. Layer-Isolation
- **Layer 2 Tests**: Keine File I/O, keine DB-Abhängigkeiten
  - Arbeiten nur mit in-memory `List[Observation]`
  - 100% wiederverwendbar für File- und DB-Implementierung
  - Testen reine Business Logic

- **Layer 3 Tests**: Testen nur I/O-Operationen
  - File Tests: Temporäre Dateien, Cleanup nach Tests
  - DB Tests: Test-Datenbank, Transaktionen mit Rollback

### 2. Reproduzierbarkeit
- Alle Tests verwenden definierte Testdaten (`create_test_observation()`)
- Keine Abhängigkeiten von Produktionsdaten
- Deterministisches Verhalten (keine Zufallswerte ohne Seed)

### 3. Isolation
- Jeder Test ist unabhängig von anderen Tests
- Setup/Teardown für Ressourcen (Dateien, DB-Connections)
- Keine globalen Zustandsänderungen zwischen Tests

### 4. Vollständigkeit
- **Happy Path**: Erfolgreiche Operationen
- **Error Cases**: Ungültige Daten, fehlende Felder
- **Edge Cases**: Leere Collections, Duplikate, Grenzwerte
- **Performance**: Große Datenmengen (optional)

## Test-Utilities

### create_test_observation()
Erstellt Test-Observations mit konfigurierbaren Key-Feldern:
```python
def create_test_observation(kk=44, o=1, jj=25, mm=1, tt=15, ee=22, gg=10):
    """Create a test observation with given key fields."""
    obs = Observation()
    obs.vers = 25
    obs.KK = kk
    obs.O = o
    obs.JJ = jj
    obs.MM = mm
    obs.TT = tt
    obs.g = 1
    # ... weitere Felder mit Standardwerten
    return obs
```

**Verwendung**:
```python
# Einfache Observation
obs = create_test_observation()

# Spezifische Key-Felder
obs1 = create_test_observation(kk=44, jj=25, mm=1)
obs2 = create_test_observation(kk=45, jj=24, mm=12)

# Test-Collection
collection = [
    create_test_observation(kk=44),
    create_test_observation(kk=45),
    create_test_observation(kk=46),
]
```

## Migration: Layer 3a → 3b (File → Database)

### Wiederverwendbare Tests (Layer 2)
Die Layer-2-Tests (`test_observations_layer2.py`) können **unverändert** für beide Implementierungen verwendet werden:

```python
# Identische Tests für File und DB
✓ Key Management (make_observation_key, find_observation)
✓ CRUD Operations (add, update, delete)
✓ Sorting (HALO-Standard: J→M→T→ZS→ZM→K→E→GG)
✓ Filtering (observer, year, month, halo_type, custom)
✓ Merging & Duplicates
✓ Statistics (count, date_range, observers)
✓ Validation (field ranges, dependencies)
✓ Format Conversion (legacy d=255→0)
```

### Storage-spezifische Tests

**Layer 3a (File)** - `test_observations_file.py`:
```python
def test_save_and_load_file():
    collection = [create_test_observation()]
    save_file("test.csv", collection)
    loaded = open_file("test.csv")
    assert len(loaded) == len(collection)
```

**Layer 3b (Database)** - `test_observations_db.py`:
```python
def test_save_and_load_db():
    collection = [create_test_observation()]
    save_to_db(collection)
    loaded = load_from_db()
    assert len(loaded) == len(collection)
```

**Unterschiede**:
- Setup/Teardown: Temporäre Dateien vs. Test-Datenbank
- I/O-Funktionen: `save_file()` vs. `save_to_db()`
- **Business Logic Tests**: Identisch (verwenden Layer 2 Funktionen)

## Status

| Modul | Layer | Testdatei | Status | Wiederverwendbar |
|-------|-------|-----------|--------|------------------|
| observers.py | 3a | test_observers.py | ✓ Completed | Nein (File I/O) |
| observations.py | 2 | test_observations_layer2.py | ✓ Completed | **JA (100%)** |
| observations_file.py | 3a | test_observations_file.py | ✓ Completed | Nein (File I/O) |
| observations_db.py | 3b | test_observations_db.py | TODO | Nein (DB I/O) |

## Ausführungshistorie

### 2026-02-06: Layer 2 Tests (observations.py)
```powershell
PS C:\ASTRO\HALOpy> python tests/io/test_observations_layer2.py
```
**Ergebnis**: ✓ ALL TESTS PASSED! (12/12 test groups)

### 2026-02-06: Layer 3a Tests (observations_file.py)
```powershell
PS C:\ASTRO\HALOpy> python tests\io\test_observations_file.py
```
**Ergebnis**: ✓ ALL TESTS PASSED! (11/11 test groups)

---

*Letzte Aktualisierung: 2026-02-06*
*Erstellt im Rahmen der File→Database Migration-Vorbereitung*
