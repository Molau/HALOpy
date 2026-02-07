# Analyse: Fileoperationen für Beobachtungen (Observations)

## Datum: 2026-02-06

## Zusammenfassung

Alle Fileoperationen für Beobachtungsdaten (observations) verwenden bereits die Klasse `ObservationCSV` aus `src/halo/io/csv_handler.py`. Diese ist eine statische Utility-Klasse mit drei Hauptmethoden.

---

## Aktueller Zustand

### Hauptmodul: `src/halo/io/csv_handler.py`

**Klasse: `ObservationCSV`** (statische Methoden)

#### Hauptfunktionen:

1. **`read_observations(filepath: Path)`**
   - Liest Beobachtungen aus CSV-Datei (Legacy oder Modern Format)
   - Returns: `Tuple[List[Observation], bool]` (observations, needs_conversion)
   - Erkennt automatisch Format und Encoding (UTF-8 oder CP850)
   - Unterstützt zwei Formate:
     - **Legacy**: Fixed positions mit Spaces (aus Original HALO)
     - **Modern**: Proper CSV mit quoted remarks
   - Zeilen: 113-147

2. **`read_observations_from_stream(stream)`**
   - Liest Beobachtungen aus In-Memory Text-Stream
   - Verwendet für File-Upload (merge)
   - Returns: `List[Observation]`
   - Zeilen: 198-212

3. **`write_observations(filepath: Path, observations: List[Observation])`**
   - Schreibt Beobachtungen im Modern CSV Format
   - Encoding: UTF-8
   - Automatisches Quoting für remarks mit Kommas
   - Special Values: -1 = nicht beobachtet, 0 = nicht vorhanden (/) für d/HO/HU
   - Zeilen: 214-302

4. **`write_to_buffer(observations, buffer)`**
   - Wie `write_observations` aber schreibt in StringIO Buffer
   - Verwendet für Download/Export ohne Datei zu erstellen
   - Zeilen: 302-372

#### Hilfsfunktionen:

- **`_detect_format_and_encoding(filepath)`**
  - Erkennt Legacy vs Modern Format
  - Erkennt Encoding (UTF-8 vs CP850/DOS)
  - Zeilen: 61-110

- **`_parse_int(value, default, slash_as_not_present)`**
  - Parst Integer mit Special Values
  - '/' oder ' ' → -1 (nicht beobachtet)
  - '/' → 0 für d und 8HHHH Felder (beobachtet aber nicht vorhanden)
  - Zeilen: 22-58

- **`_parse_observation_parts(parts)`**
  - Parst CSV-Felder zu Observation-Objekt
  - Behandelt alle 23 Felder korrekt
  - Zeilen: 149-196

---

## Verwendung in der Anwendung

### 1. **Startup (app.py)**

**Cloud Mode:**
```python
# Zeile 59-79
data_path = root_path / 'data' / 'all.csv'
observations, needs_conversion = ObservationCSV.read_observations(data_path)
app.config['OBSERVATIONS'] = observations
app.config['LOADED_FILE'] = 'all.csv'
if needs_conversion:
    ObservationCSV.write_observations(data_path, observations)
```

**Local Mode (optional startup file):**
```python
# Zeile 82-104
startup_file = app.config.get('STARTUP_FILE')
data_path = root_path / 'data' / startup_file
observations, needs_conversion = ObservationCSV.read_observations(data_path)
app.config['OBSERVATIONS'] = observations
app.config['LOADED_FILE'] = startup_file
if needs_conversion:
    ObservationCSV.write_observations(data_path, observations)
```

**Häufigkeit**: 1× beim Startup (Cloud) oder 0-1× (Local mit Startup-File)

---

### 2. **Auto-Save bei Cloud Mode (routes.py)**

```python
# Zeile 28-45: _auto_save_if_cloud()
def _auto_save_if_cloud():
    if is_cloud_mode():
        observations = current_app.config.get('OBSERVATIONS', [])
        root_path = Path(current_app.root_path).parent.parent
        data_path = root_path / 'data' / 'all.csv'
        ObservationCSV.write_observations(data_path, observations)
```

**Aufgerufen nach**: Jeder Datenänderung in Cloud Mode  
**Häufigkeit**: Automatisch bei allen Create/Update/Delete Operationen

---

### 3. **Datei-Operationen (routes.py)**

#### a) **Neue Datei erstellen** (`/file/new`)
```python
# Zeile 908-943
@api_blueprint.route('/file/new', methods=['POST'])
def new_file():
    ObservationCSV.write_observations(Path(filepath), [])
    current_app.config['OBSERVATIONS'] = []
    current_app.config['LOADED_FILE'] = filename
```
**Operation**: WRITE (leere Datei)

#### b) **Datei vom Browser laden** (`/file/load`)
```python
# Zeile 946-992
@api_blueprint.route('/file/load', methods=['POST'])
def load_file_from_browser():
    observations, needs_conversion = ObservationCSV.read_observations(temp_path)
    current_app.config['OBSERVATIONS'] = observations
    current_app.config['LOADED_FILE'] = file.filename
```
**Operation**: READ

#### c) **Datei aus data/ Ordner laden** (`/file/load/<filename>`)
```python
# Zeile 1062-1097
@api_blueprint.route('/file/load/<filename>', methods=['GET', 'POST'])
def load_file(filename):
    observations, needs_conversion = ObservationCSV.read_observations(filepath)
    if needs_conversion:
        ObservationCSV.write_observations(filepath, observations)
    current_app.config['OBSERVATIONS'] = observations
    current_app.config['LOADED_FILE'] = filename
```
**Operation**: READ, optional WRITE (bei Konvertierung)

#### d) **Datei verbinden (merge)** (`/file/merge`)
```python
# Zeile 996-1058
@api_blueprint.route('/file/merge', methods=['POST'])
def merge_file():
    new_observations = ObservationCSV.read_observations_from_stream(file_object)
    # Merge Logik...
    current_app.config['OBSERVATIONS'] = combined_observations
```
**Operation**: READ (Stream)

#### e) **Datei speichern** (`/file/save`)
```python
# Zeile 1101-1162
@api_blueprint.route('/file/save', methods=['POST'])
def save_file():
    observations = current_app.config.get('OBSERVATIONS', [])
    # ... Schreibt in temp file und returnt als download
    # Kein direkter ObservationCSV call - nutzt send_file
```
**Operation**: WRITE (implizit via send_file)

#### f) **Datei speichern als** (`/file/saveas`)
```python
# Zeile 1166-1203
@api_blueprint.route('/file/saveas', methods=['POST'])
def save_file_as():
    ObservationCSV.write_observations(Path(filepath), observations)
    current_app.config['LOADED_FILE'] = filename
```
**Operation**: WRITE

#### g) **Gefilterte Datei speichern** (`/observations/save`)
```python
# Zeile 654-700
@api_blueprint.route('/observations/save', methods=['POST'])
def save_filtered_observations():
    ObservationCSV.write_observations(filepath, observations)
```
**Operation**: WRITE (gefilterte Subset)

---

### 4. **Download-Operationen**

#### a) **Download gefilterte Beobachtungen** (`/file/download`)
```python
# Zeile 1344-1472
@api_blueprint.route('/file/download', methods=['POST'])
def download_file():
    all_observations, _ = ObservationCSV.read_observations(all_csv_path)
    # ... Filter anwenden
    ObservationCSV.write_to_buffer(filtered_observations, csv_buffer)
    # Return als download
```
**Operation**: READ (all.csv in Cloud), WRITE (Buffer)

---

### 5. **Auto-Save und Recovery**

#### a) **Auto-Save Temp File** (`/file/autosave`)
```python
# Zeile 1508-1523
@api_blueprint.route('/file/autosave', methods=['POST'])
def autosave():
    observations = current_app.config.get('OBSERVATIONS', [])
    ObservationCSV.write_observations(temp_filepath, observations)
```
**Operation**: WRITE (temp file mit .$$$ extension)

#### b) **Restore von Temp File** (`/file/restore`)
```python
# Zeile 1527-1556
@api_blueprint.route('/file/restore', methods=['POST'])
def restore_temp():
    observations, needs_conversion = ObservationCSV.read_observations(temp_filepath)
    if needs_conversion:
        ObservationCSV.write_observations(temp_filepath, observations)
    current_app.config['OBSERVATIONS'] = observations
```
**Operation**: READ, optional WRITE (bei Konvertierung)

---

### 6. **Weitere Verwendungen**

#### a) **ALLE.CSV Check** (deprecated?)
```python
# Zeile 844-875
@api_blueprint.route('/check-alle-csv', methods=['GET'])
def check_alle_csv():
    csv_handler = ObservationCSV()
    observations, needs_conversion = csv_handler.read_observations(str(data_path))
    if needs_conversion:
        csv_handler.write_observations(data_path, observations)
```
**Operation**: READ, optional WRITE

#### b) **Analysis/Output Statistiken**
```python
# Zeile 5432-5443
# Verwendet ObservationCSV nur als Instanz-Objekt, keine I/O
csv_handler = ObservationCSV()
```
**Operation**: Keine I/O (nur als Utility-Objekt)

---

## Statistik der Operationen

### READ Operationen (7):
1. app.py: Cloud mode startup → `read_observations()`
2. app.py: Local mode startup (optional) → `read_observations()`
3. routes.py: Browser file load → `read_observations()`
4. routes.py: Server file load → `read_observations()`
5. routes.py: File merge → `read_observations_from_stream()`
6. routes.py: Download all.csv (Cloud) → `read_observations()`
7. routes.py: Restore temp file → `read_observations()`

### WRITE Operationen (9):
1. app.py: Cloud startup conversion → `write_observations()`
2. app.py: Local startup conversion → `write_observations()`
3. routes.py: Auto-save in Cloud → `write_observations()` (häufig!)
4. routes.py: New empty file → `write_observations()`
5. routes.py: Save file as → `write_observations()`
6. routes.py: Save filtered subset → `write_observations()`
7. routes.py: Download filtered → `write_to_buffer()`
8. routes.py: Auto-save temp → `write_observations()`
9. routes.py: Format conversion → `write_observations()` (mehrere Stellen)

**Total: 16+ Verwendungsstellen**

---

## Aktuelles Design

### Vorteile:
✓ Bereits zentralisiert in einer Klasse
✓ Klare Trennung von Read/Write
✓ Format-Erkennung automatisch
✓ Legacy-Format Unterstützung
✓ Special Values korrekt behandelt

### Nachteile:
✗ Statische Klasse (könnte einfache Funktionen sein)
✗ Format-Logik vermischt mit I/O
✗ Keine klare Trennung zwischen File- und Stream-Operations
✗ Path-Handling überall verteilt (data/, resources/)
✗ Temp-File-Logik überall dupliziert
✗ Auto-save Logik in routes.py statt in I/O Layer

---

## Refactoring-Potenzial

### Option 1: Behalte Klasse, erweitere Funktionalität
- Füge High-Level Funktionen hinzu (wie bei observers.py)
- Beispiel: `load_from_data_folder()`, `auto_save()`, `create_temp_backup()`
- Vorteil: Minimale Änderungen
- Nachteil: Klasse wird größer und komplexer

### Option 2: Konvertiere zu Funktions-API (wie observers.py)
- Erstelle `src/halo/io/observations.py` mit Funktionen
- Beispiel:
  - `load_observations(filepath)`
  - `save_observations(observations, filepath)`
  - `get_data_path(filename)`
  - `create_temp_backup(observations, filename)`
  - `restore_from_backup(filename)`
- Vorteil: Konsistent mit observers.py, einfacher zu testen
- Nachteil: Mehr Refactoring nötig (16+ Stellen)

### Option 3: Hybrid-Ansatz
- Low-Level: `csv_handler.py` (Format-Parsing, bleibt Klasse)
- High-Level: `observations.py` (File-Operations, Funktionen)
- Vorteil: Beste Trennung von Concerns
- Nachteil: Zwei Module statt einem

---

## Empfehlung

**Option 2 oder 3** - ähnlich wie bei observers.py:

### Neue Struktur:
```
src/halo/io/
├── __init__.py          # Exports
├── observers.py         # ✓ Observer-Operationen (bereits refactored)
├── observations.py      # NEU: High-Level Observation-Operationen
└── csv_handler.py       # KEEP: Low-Level CSV Parsing (oder umbenennen)
```

### Neue Funktionen in `observations.py`:
```python
def load_observations(filepath=None, filename=None)
def save_observations(observations, filepath=None, filename=None)
def get_data_path(filename)
def create_new_file(filename)
def merge_observations(current, new)
def create_temp_backup(observations, base_filename)
def restore_from_backup(base_filename)
def auto_save_if_cloud(observations)
```

### Vorteile:
✓ Konsistent mit observers.py Refactoring
✓ DRY - keine duplizierten Pfad-/Temp-File-Logik
✓ Leichter zu testen
✓ Klare API-Grenzen
✓ Path-Handling zentralisiert

---

## Nächste Schritte (falls gewünscht)

1. Erstelle `observations.py` mit High-Level Funktionen
2. Konsolidiere Path-Handling (data_path, temp_path)
3. Refactore routes.py (16+ Stellen)
4. Refactore app.py (2 Stellen)
5. Update __init__.py Exports
6. Tests erstellen

**Geschätzter Aufwand**: 2-3 Stunden
