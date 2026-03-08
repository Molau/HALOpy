# HALOpy – Vollständige Source Code Analyse

**Datum:** 2026-02-26  
**Version:** 3.1.4  
**Analysierte Dateien:** ~28.000 Zeilen (Python + JavaScript + HTML)

---

## Inhaltsverzeichnis

1. [Zusammenfassung](#1-zusammenfassung)
2. [Architektur-Übersicht](#2-architektur-übersicht)
3. [Richtlinien-Verstöße (i18n, Fallbacks, statische Texte)](#3-richtlinien-verstöße)
4. [Architektur-Inkonsistenzen](#4-architektur-inkonsistenzen)
5. [Redundanter & ineffizienter Code](#5-redundanter--ineffizienter-code)
6. [Verwaister Code (Dead Code)](#6-verwaister-code)
7. [Uneinheitliche Implementierung](#7-uneinheitliche-implementierung)
8. [Sicherheitsprobleme](#8-sicherheitsprobleme)
9. [Modulstruktur](#9-modulstruktur)
10. [Validierung von User-Input](#10-validierung-von-user-input)
11. [Bugs](#11-bugs)
12. [Verbesserungsvorschläge (priorisiert)](#12-verbesserungsvorschläge)

---

## 1. Zusammenfassung

| Kategorie | Kritisch | Hoch | Mittel | Niedrig |
|---|---|---|---|---|
| Sicherheit | 2 | 3 | 4 | 2 |
| Richtlinien-Verstöße | 1 | 5 | 3 | – |
| Architektur/Redundanz | – | 6 | 8 | 4 |
| Bugs | 2 | 3 | 2 | – |
| Gesamt | **5** | **17** | **17** | **6** |

**Hauptprobleme:**
- **routes.py** ist mit 7.382 Zeilen ein Monolith; Geschäftslogik, Formatierung, Chart-Erzeugung und alle API-Endpunkte in einer Datei
- **main.js** ist mit 9.572 Zeilen ebenfalls ein Monolith
- XSS-Schwachstellen durch >50 unescapte `innerHTML`/`insertAdjacentHTML`-Nutzungen
- ~~Cloud-Mode: Kein CSRF-Schutz~~, Observer-Liste vor Authentifizierung öffentlich
- ~~DB-Observation-Key fehlen ZS/ZM → falsche Records bei Update/Delete möglich~~ ✅ behoben 2026-03-07
- 62 unnötige i18n-Fallbacks in routes.py + hardcodierte deutsche Texte in Charts

---

## 2. Architektur-Übersicht

```
Schicht 1: Web           web/app.py (Flask Factory, Routes, Middleware)
Schicht 2: API           api/routes.py (7.382 Zeilen!), api/update.py
Schicht 3: Business      io/observations.py, io/observers.py
Schicht 4a: File I/O     io/observations_file.py, io/observers_file.py, io/csv_handler.py
Schicht 4b: DB I/O       io/observations_db.py, io/observers_db.py, io/db_connection.py
Services:                services/auth.py, services/settings.py
Ressourcen:              resources/i18n.py, strings_de.json, strings_en.json
Models:                  models/constants.py
```

Die Schichtentrennung ist grundsätzlich gut entworfen. Das Hauptproblem: Fast die gesamte Geschäftslogik (Statistik-Berechnung, Report-Formatierung, Chart-Erzeugung, Analyse-Engine) liegt in `routes.py` statt in eigenen Service-Modulen.

---

## 3. Richtlinien-Verstöße

### 3.1 ~~i18n-Fallbacks in Python~~ ✅ behoben 2026-03-07

**63 Vorkommen** von `i18n.get('key', 'German fallback')` in `routes.py` (Zeilen 3160–4497). Regel: Keine Fallbacks – wenn ein Key fehlt, soll es sichtbar fehlschlagen.

**1 fehlender Key** (maskierter Bug):
- `routes.py:4059` → `i18n.get("annual_stats.table_totals", "Gesamt")` – Key existiert nicht in JSON

**Status:** Behoben. Alle 63 Fallback-Argumente entfernt. Key `annual_stats.table_total` mit `annual_stats.table_totals` zusammengelegt (DE: "Gesamt", EN: "Total"). Scan aller PY- und JS-Dateien: keine weiteren i18n-Fallbacks.

### 3.2 ~~Hardcodierte deutsche Texte~~ ✅ behoben 2026-03-07

| Datei | Stelle | Text | Status |
|---|---|---|---|
| `routes.py:3710` | Chart-Titel | `'Haloaktivität im {month_name} {year}'` | ✅ i18n |
| `routes.py:3711` | Chart-Subtitle | `'berechnet aus {count} Einzelbeobachtungen'` | ✅ i18n |
| `routes.py:3793` | Bar-Chart | gleich | ✅ i18n |
| `routes.py:3907` | Annual Chart | `'berechnet aus {total_ee} Einzelbeobachtungen'` | ✅ i18n |
| `routes.py:7345` | Analyse | `'keine Angabe'` | ✅ entfernt mit #12 (dead code) |
| `main.js:2801` | Dialog-Label | `'8HO (obere Lichtsäule)'` | ✅ i18n |
| `main.js:2808` | Dialog-Label | `'HU (untere Lichtsäule)'` | ✅ i18n |
| `main.js:4716` | Nachricht | `'${newFilename} gespeichert'` | ✅ i18n |
| `analysis.js:235` | Dropdown | `'${i} Uhr'` | ✅ i18n |
| `analysis.js:1597` | Fehler | `'Fehler bei der Auswertung'` | ✅ i18n |
| `main.js:4089` | Dropdown | `'${i} Uhr'` | ✅ i18n |
| `halo.py:56-68` | Konsole | `'Fehlende Pakete erkannt'` etc. | Ausnahme: Pre-Flask Startup, kein i18n verfügbar |

### 3.3 Inkonsistente Error-Response-Keys (MITTEL)

Zwei Stile gemischt in der API:
- **i18n-ready keys:** `'error': 'no_file_loaded'`, `'error': 'file_already_exists'`
- **Englische Klartext-Meldungen:** `'error': 'No file loaded'`, `'error': 'File not found'`

**Empfehlung:** Einheitlich i18n-Keys als Error-Codes verwenden.

---

## 4. Architektur-Inkonsistenzen

### 4.1 ~~DB vs. File – unterschiedliche Observation-Keys~~ ✅ behoben 2026-03-07

| Modus | Key-Felder |
|---|---|
| File (observations.py) | KK, O, JJ, MM, TT, **g**, **ZS, ZM**, EE (9-Tupel) |
| DB (observations_db.py) | KK, O, JJ, MM, TT, **g**, **ZS, ZM**, EE (9-Tupel) |

**Status:** Behoben. DB-Schema (UNIQUE CONSTRAINT + Index) und Python-Code (`update_one`, `delete_one`, `delete_observation` Endpoint) auf 9-Tupel mit g, ZS, ZM erweitert. Key-Feld GG durch g ersetzt.

### 4.2 Cloud/Local-Branching in jedem Endpoint (HOCH)

Nahezu jeder API-Endpoint enthält `if is_cloud_mode(): ... else: ...` mit oft fast identischem Code für beide Pfade. Die Repository-Abstraktion (Layer 3) wird nicht konsequent genutzt.

**Betroffen:** ~14 Endpoints in routes.py

**Empfehlung:** Ein Repository-Pattern oder Strategy-Pattern (z.B. `ObservationStore` Interface) einführen, das Cloud/Local transparent kapselt.

### 4.3 Password Policy im Frontend (MITTEL)

`main.js:25-53`: Vollständige Passwort-Policy als JavaScript-Konstante:
```javascript
const PASSWORD_POLICY = {
    minLength: 8, requireCategories: 3,
    categories: { lowercase: /[a-z]/, uppercase: /[A-Z]/, ... }
};
```

Diese Information gehört ins Backend. Ein Angreifer sieht die exakten Komplexitäts-Anforderungen. Backend validiert die Policy hoffentlich ebenfalls (nicht verifiziert in auth.py – dort wird nur `len >= 4` geprüft!).

### ~~4.4 CSV-Parsing im Frontend~~ ✅ behoben 2026-03-07

~~`main.js:~5180-5230`: Die Upload-Funktion parsed CSV-Dateien komplett im Browser. Datenvalidierung und -parsing gehört ins Backend.~~

**Status:** Behoben. Frontend sendet rohen CSV-Text (`csv_text`) an `/api/file/upload`. Backend nutzt `ObservationCSV.read_observations_from_stream()` (mit `csv.reader` für korrekte Behandlung gequoteter Felder). ~35 Zeilen JS-Parsing-Logik entfernt.

### ~~4.5 `save_many()` Transaktions-Bug~~ ✅ behoben 2026-03-07

**Status:** Behoben. `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` statt `conn.rollback()` – bei IntegrityError wird nur der fehlgeschlagene Insert zurückgerollt, alle vorherigen bleiben erhalten.

---

## 5. Redundanter & ineffizienter Code

### 5.1 Massive Duplikate in routes.py (HOCH)

| Duplication | Vorkommen | Geschätzte Zeilen |
|---|---|---|
| ~~Cloud-Auth-Pattern (session vs password check)~~ | ~~4× (upload/download endpoints)~~ | ~~\~100 Zeilen~~ |
| | ✅ behoben: zentralisiert in `_check_cloud_write_auth()` in files.py |
| ~~Active-Observer-Bestimmung (seit/aktiv Parsing)~~ | ~~2× (monthly + annual stats)~~ | ~~\~130 Zeilen~~ |
| | ✅ behoben: zentralisiert via `_parse_seit()` in _helpers.py |
| ~~Chart-Generierung (line + bar × monthly + annual)~~ | ~~4 Funktionen, 80% identisch~~ | ~~\~300 Zeilen~~ |
| | ✅ behoben: konsolidiert in statistics.py |
| ~~Smoothing-Kernel (np.interp + np.convolve)~~ | ~~4× in Chart-Funktionen~~ | ~~\~80 Zeilen~~ |
| | ✅ behoben: pro Funktion integriert, keine Duplikate |
| ~~EE-Splitting (combined→individual)~~ | ~~4× inline statt `resolve_halo_type()`~~ | ~~\~60 Zeilen~~ |
| | ✅ behoben: einheitlich via `resolve_halo_type()` in constants.py |
| ~~C-Type-Splitting (C4-C7→Komponenten)~~ | ~~3× in Analyse-Engine (analysis.py)~~ | ~~\~60 Zeilen~~ |
| | ✅ behoben: zentralisiert in `_expand_c_type()` in analysis.py |
| ~~SE-Sector-Handling (V=1→parse, V=2→all)~~ | ~~3× in Analyse-Engine (analysis.py)~~ | ~~\~75 Zeilen~~ |
| | ✅ behoben: zentralisiert in `_resolve_sector_list()` in analysis.py |
| ~~Format-Dispatch (json/text/markdown/chart)~~ | ~~2× (statistics.py + analysis.py)~~ | ~~\~20 Zeilen~~ |
| | ✅ behoben: zentralisiert in `dispatch_format_response()` in _helpers.py |
| ~~Observer-Record-Konstruktion~~ | ~~2× (add + update site)~~ | ~~\~40 Zeilen~~ |
| | ✅ behoben: vereinheitlicht via observers_db.py / observers_file.py |
| ~~Timezone-Offset-Berechnung~~ | ~~2× (observations_db.py + analysis.py, identisch)~~ | ~~\~30 Zeilen~~ |
| | ✅ behoben: zentralisiert in `get_timezone_offset()` in constants.py (inkl. Bugfix: analysis.py nutzte fehlerhafte hardcodierte Werte statt ZEITZONE-Array) |

### 5.2 Massive Duplikate in JavaScript (HOCH)

| Duplication | Vorkommen | Geschätzte Zeilen |
|---|---|---|
| ~~`kurzausgabe()` Funktion~~ | ~~2× (main.js + observations.js, **divergierend!**)~~ | ~~\~270 Zeilen~~ |
| | ✅ behoben 2026-07-12: eine korrekte Implementierung in main.js, Kopien aus observations.js + monthly_report.js entfernt |
| ~~Observer-Site-Formular (HTML-Template)~~ | ~~5× (add/edit/delete Dialoge in main.js)~~ | ~~\~1.000 Zeilen~~ |
| | ✅ behoben 2026-03-07: 4 Helper-Funktionen (`generateSiteFormOptions`, `generateSiteFormFields`, `populateSiteForm`, `collectSiteFormData`), alle 4 Dialoge refactored |
| ~~`escapeHtml()`~~ | ~~3× (monthly_stats, annual_stats, monthly_report)~~ | ~~\~15 Zeilen~~ |
| | ✅ behoben 2026-03-08: globale Funktion in modal-utils.js |
| `checkDataLoaded()` | 2× (monthly_stats.js, annual_stats.js — fast identisch) | ~40 Zeilen |
| `showWarningModal()` | 3× (modal-utils.js global + analysis.js + monthly_stats.js lokal) | ~80 Zeilen |
| `getParameterRange()` | 2× (analysis.js + main.js Kopie) | ~100 Zeilen |
| `populateDayFields()` Varianten | 2× in analysis.js (+ `populateDayFields2()`) | ~160 Zeilen |
| Observer-Dropdown-Population | 3× (monthly_report.js, observations.js, filter-dialog.js) | ~60 Zeilen |

### 5.3 `_int()` doppelt definiert (NIEDRIG)

- `routes.py:378` – `_int()` als Top-Level-Funktion
- `constants.py:122` – identische `_int()` als Modul-Level-Funktion

### 5.4 Doppelter Import (NIEDRIG)

`routes.py:56` und `routes.py:62` importieren beide `halo.io.observations_db as obs_db`.

---

## 6. Verwaister Code

| Datei | Code | Beschreibung |
|---|---|---|
| ~~`routes.py:2036`~~ | ~~`/file/autosave_old` Endpoint~~ | ~~Vollständige alte Autosave-Implementierung, nie referenziert~~ ✅ entfernt |
| ~~`routes.py:3107-3111`~~ | ~~`_format_monthly_stats_html()`~~ | ~~Gibt nur `json.dumps(data)` zurück – identisch mit JSON-Pfad~~ ✅ entfernt |
| ~~`routes.py:4506-4510`~~ | ~~`_format_annual_stats_html()`~~ | ~~Gibt nur `jsonify(data)` zurück – identisch mit JSON-Pfad~~ ✅ entfernt |
| ~~`routes.py:7333-7382`~~ | ~~`_format_parameter_value()`~~ | ~~Docstring sagt: "currently unused (formatting done in JS)"~~ ✅ entfernt |
| ~~`csv_handler.py:63-86`~~ | ~~`_parse_int()`~~ | ~~Nie aufgerufen, ersetzt durch `_norm()`~~ ✅ entfernt |
| ~~`main.js:2215`~~ | ~~`updatePageText()`~~ | ~~Kommentar: "This function is now redundant... does nothing"~~ ✅ entfernt |
| ~~`main.js:6256`~~ | ~~`showMessage()`~~ | ~~Legacy-Wrapper für `showNotification()`~~ ✅ entfernt |
| ~~`observations.js:432`~~ | ~~`populateRegionSelect()`~~ | ~~Nie aufgerufen; `populateRegionSelectForFilter1()` wird stattdessen genutzt~~ ✅ entfernt |
| ~~`analysis.js:2710-2718`~~ | ~~Auskommentiertes Export/Import~~ | ~~Auskommentierter Code~~ ✅ entfernt |

---

## 7. Uneinheitliche Implementierung

### 7.1 Template-Struktur

~~**Kein Base-Template:**~~ ~~Alle 10 Templates wiederholen den identischen `<head>`-Block (~12 Zeilen × 10 = 120 Zeilen Duplikat). Keine `{% extends 'base.html' %}`-Nutzung.~~ ✅ behoben 2026-07-12: `base.html` eingeführt, 8 Templates migriert

~~**Cache-Busting inkonsistent:**~~
- `login.html`: CSS + JS versioniert ✓
- ~~`analysis.html`: Kein einziges Script versioniert ✗~~ ✅ behoben 2026-03-07
- ~~Sonstige: gemischt~~ ✅ alle Templates versioniert

~~**Body-Class inkonsistent:**~~
~~- Die meisten Templates: `<body class="d-flex flex-column min-vh-100">`~~
~~- `analysis.html`: `<body>` ohne Klassen → verliert Sticky-Footer-Layout~~
✅ behoben 2026-07-12: Alle Templates erben `<body>` von `base.html`

### ~~7.2 Menü-Highlighting (fragil)~~ ✅ behoben 2026-03-07

~~Jede Seite nutzt hardcodierten Index: `menus[N].classList.add('active')`. Wenn ein Menüpunkt hinzugefügt/umgeordnet wird, brechen alle Indices.~~

**Lösung:** `data-page`-Attribut auf jedem `.menu-title`-Link in `header.html`. Zentrale `highlightMenu(page)`-Funktion in `main.js` ersetzt 4 indexbasierte Funktionen. Alle Templates nutzen `highlightMenu('...')` statt `menus[N]`.

### 7.3 Modal-Dialoge

- **41+ `insertAdjacentHTML`-Aufrufe** mit inline HTML-Template-Literals in main.js
- Keine wiederverwendbare Modal-Factory
- Jeder Dialog reimplementiert Header/Body/Footer/Cleanup
- `data-bs-keyboard` (Escape-Key): `true` bei monthly_stats, `false` bei den anderen
- Footer-Padding: `py-2` bei den meisten, fehlt bei observers.html und analysis.html
- Button-IDs: `cancel-filter` vs. `btn-cancel-filter` (inkonsistente Namensgebung)

### 7.4 Option-Generierung

Zwei verschiedene Patterns für Monats-Auswahl:
- `Array.from({length: 12}, ...)` (main.js:7584)
- `Object.keys(i18nStrings.months).map(...)` (main.js:8454)

Jahr-Werte als 2-Digit vs. 4-Digit inkonsistent zwischen Dialogen.

### ~~7.5 Region-Listen~~ ✅ behoben 2026-03-07

~~- `filter-dialog.js`: Iteriert 1..39 sequentiell (erzeugt ~6 leere Einträge für 12-15, 18)~~
~~- `analysis.js`: Nutzt explizite Region-Liste `[1,2,3,...,11,16,17,19,...,39]`~~
~~- `constants.py`: Definiert `GEOGRAPHIC_REGIONS` – wird im Frontend nicht genutzt~~

**Lösung:** `GEOGRAPHIC_REGIONS` wird über `/api/constants` geladen und als globale Variable in `main.js` bereitgestellt. Alle JS-Dateien nutzen nun diese Variable.

### ~~7.6 Halo-Type-Listen~~ ✅ behoben 2026-03-07

~~- `filter-dialog.js:372-378`: Iteriert 1..99, erzeugt ~20 "unknown"-Einträge für 78-98~~
~~- `analysis.js`: Filtert korrekt nur existierende Typen~~

**Lösung:** Neue Konstante `VALID_HALO_TYPES` (1-77 + 99) in `constants.py`, über `/api/constants` bereitgestellt. `COMBINED_HALO_TYPES` wird ebenfalls aus Backend-Daten abgeleitet. Alle JS-Dateien nutzen nun die Backend-Globals.

---

## 8. Sicherheitsprobleme

### 8.1 XSS durch unescaptes innerHTML (KRITISCH)

>50 Stellen in JavaScript nutzen `innerHTML` / `insertAdjacentHTML` mit Daten aus API-Responses:

| Datei | Betroffen | Risiko |
|---|---|---|
| `observers.js:260-290` | Observer-Namen (`VName`, `NName`, `HbOrt`, `NbOrt`) direkt in HTML | HOCH |
| `observer_sites.js:50` | Observer-Namen in Modal-Titeln | HOCH |
| `monthly_report.js:471-472` | Standort-Namen (`observer_hbort`, `observer_nbort`) | HOCH |
| `analysis.js:~476` | Observer-Namen in Analyse-Tabellen | HOCH |
| `modal-utils.js:147` | `config.body` als Raw-HTML eingefügt | MITTEL |
| `main.js:6746` | Notification `message` als innerHTML | MITTEL |

~~**Empfehlung:** Zentrale `escapeHtml()`-Funktion in einer shared utility; konsequent auf alle Daten anwenden, die aus API-Responses stammen.~~

**Status:** ✅ behoben 2026-03-08. Globale `escapeHtml()` in `modal-utils.js` definiert (geladen vor allen anderen JS). 3 duplizierte lokale Definitionen entfernt. Alle innerHTML-Injektionen mit Benutzerdaten (VName, NName, HbOrt, NbOrt, sectors, remarks, file.name, error.message, filename) konsequent mit `escapeHtml()` geschützt in: main.js, observers.js, observer_sites.js, observation-form.js, analysis.js.

### ~~8.2 Kein CSRF-Schutz~~ ✅ behoben 2026-03-07

**Status:** Behoben. Flask-WTF `CSRFProtect` eingeführt. CSRF-Token wird per `<meta>` Tag in alle Templates injiziert. Alle `fetch()`-Aufrufe senden den Token automatisch via `X-CSRFToken` Header (globaler fetch-Wrapper in footer.html und login.html). CORS-Endpoints (file upload/download, observers upload/download) und Update/Restart sind per `@csrf.exempt` ausgenommen.

### 8.3 Observer-Liste vor Authentifizierung öffentlich – BEWUSSTE ENTSCHEIDUNG

`app.py:166`: `/api/observers/list` ist von der Auth-Prüfung ausgenommen ("Public endpoint for login dropdown"). Damit sind alle Beobachter-Kennungen und -Namen für nicht-authentifizierte Benutzer sichtbar.

**Status:** Bewusste Entscheidung. Die Observer-Namen werden am Login-Prompt als Dropdown angezeigt, damit Benutzer ihren Account auswählen können. Das ist beabsichtigt und kein Sicherheitsproblem.

### ~~8.4 Upload-Passwort im Klartext~~ ✅ behoben 2026-03-07

**Status:** Behoben. Passwort wird nicht mehr lokal gespeichert. Endpoint umbenannt zu `/config/upload_observer_kk` – speichert nur noch die Observer-Kennung als Komfort-Vorauswahl. `obfuscate()`/`deobfuscate()` und `UPLOAD_PASSWORD` Config-Key komplett entfernt. User gibt das Passwort bei jedem Upload/Download frisch ein.

### ~~8.5 Passwort-Policy-Diskrepanz~~ ✅ behoben 2026-03-07

**Status:** Behoben. Passwort-Policy zentral in `constants.py` definiert (`PASSWORD_MIN_LENGTH = 8`, `PASSWORD_REQUIRE_CATEGORIES = 3`). Backend (`auth.py`) importiert diese Konstanten und validiert mit `AuthService.validate_password()` (Länge + 3 von 4 Zeichenkategorien). Frontend erhält die Policy über `/api/constants` (`password_policy`) und überschreibt die lokalen Defaults beim Startup. Einzelne Quelle der Wahrheit, keine Diskrepanz mehr möglich.

### 8.6 Auto-Update ohne Signatur-Prüfung (MITTEL)

`update.py`: Downloads von GitHub und überschreibt lokale Dateien ohne Integritätsprüfung (kein Checksum, keine Signatur).

### ~~8.7 SQL-Injection in Field-Names~~ ✅ behoben 2026-03-07

~~`observations_db.py` → `build_analysis_sql()`: Feld-Namen werden als f-Strings interpoliert (`f'"{param_name}"'`). Wenn `param_name` aus User-Input kommt ohne Whitelist-Validierung, ist SQL-Injection über den Feldnamen möglich.~~

**Status:** Behoben. `VALID_ANALYSIS_PARAMS`-Whitelist (19 gültige HALO-Parameter) in `build_analysis_sql()` eingeführt. Sowohl `add_filter()` als auch `add_param_range()` validieren `param_name` gegen die Whitelist bevor SQL konstruiert wird.

### 8.8 `SECRET_KEY` als Hardcoded Default (NIEDRIG)

`app.py:53`: `'SECRET_KEY': 'dev-secret-key-change-in-production'` – im Cloud-Modus wird hoffentlich überschrieben (via `get_secret_key()`), aber der Fallback ist unsicher.

### ~~8.9 `/api/update` und `/api/restart` ohne Auth~~ ✅ behoben 2026-03-07

**Status:** Behoben. Beide Endpoints prüfen jetzt Autorisierung über `_check_update_auth()`: Cloud-Modus komplett deaktiviert (Deployment extern verwaltet), Local-Modus erlaubt nur Requests von localhost (`127.0.0.1`, `::1`). `/api/restart` wird vom Frontend nicht genutzt.

---

## 9. Modulstruktur

### 9.1 routes.py – God Object (KRITISCH)

7.382 Zeilen in einer Datei. Enthält:
- ~70 API-Endpoints
- Astronomie-Berechnungen (~100 Zeilen)
- Report-Formatierung Text/Markdown/HTML (~1.500 Zeilen)
- Chart-Generierung mit matplotlib (~400 Zeilen)
- Analyse-Engine mit Filterung/Gruppierung (~1.200 Zeilen)
- Observer-CRUD (~900 Zeilen)
- Observation-CRUD (~600 Zeilen)
- File-Operations (~500 Zeilen)
- Hilfsfunktionen (~300 Zeilen)

**Empfehlung:** Aufteilen in:
```
api/
  routes_observations.py   # Observation CRUD + Search
  routes_observers.py      # Observer CRUD + Sites
  routes_file.py           # File load/save/upload/download
  routes_stats.py          # Monthly + Annual Stats
  routes_analysis.py       # Analysis Engine
  routes_config.py         # Settings + Config
  routes_auth.py           # Login/Logout/Password
services/
  formatting.py            # Text/Markdown/HTML-Formatierung
  charts.py                # matplotlib Chart-Generierung
  statistics.py            # Statistik-Berechnungen
  solar.py                 # Astronomie-Berechnungen
```

### 9.2 main.js – God Object (HOCH)

9.572 Zeilen. Enthält Observer-CRUD (~2.000), File-Ops (~1.000), Observation-Dialoge (~1.500), Selection/Filter (~500), Settings (~500), i18n (~300), Utilities (~200), und mehr.

**Empfehlung:** Analog zu den bereits ausgelagerten `observation-form.js`, `filter-dialog.js` etc. weitere Module extrahieren:
```
js/
  observer-management.js   # Observer CRUD Dialoge
  file-operations.js       # File Load/Save/Upload/Download Dialoge
  settings-dialogs.js      # Settings-Dialoge
  notifications.js         # Notification-System
  utils.js                 # escapeHtml, formatters, shared helpers
```

### 9.3 Kein JavaScript-Modulsystem (MITTEL)

Alle JS-Dateien sind im globalen Scope oder IIFE-wrapped. Kein ES Module `import`/`export`. Funktionen wie ~~`kurzausgabe()`~~ oder `getParameterRange()` können nicht geteilt werden und werden stattdessen kopiert. (`kurzausgabe()` ✅ dedupliziert 2026-07-12)

### ~~9.4 Kein Base-Template (MITTEL)~~

~~10 HTML-Templates ohne `{% extends 'base.html' %}`. Jede Änderung am `<head>`, Menü oder Footer muss manuell in allen Dateien nachgezogen werden.~~
✅ behoben 2026-07-12: `base.html` eingeführt, 8 Templates migriert (`login.html` bleibt eigenständig)

---

## 10. Validierung von User-Input

### 10.1 API-Input-Validierung (HOCH)

| Endpoint | Problem |
|---|---|
| `POST /observations` | Nur Pflichtfeld-Existenz geprüft, keine Wertbereichs-Validierung (z.B. MM=0..99, GG=1..39) |
| `POST /observations/search` | `criterion1`, `criterion2`, `value1`, `value2` nicht validiert – `int()` kann crashen |
| `POST /file/save` | Filename nicht auf Pfad-Traversal geprüft (z.B. `../../etc/passwd`) |
| `GET /observations` | `limit` und `offset` Parameter werden direkt zu `int()` konvertiert ohne try/except |
| `POST /analysis` | Parameter-Namen nicht gegen Whitelist validiert → potenzielle SQL Injection |
| `PUT /config/*` | Keine Validierung der Werte, die in Settings gespeichert werden |

### 10.2 Frontend-Only-Validierung (MITTEL)

Diese Validierungen existieren nur im Browser und können per direktem API-Aufruf umgangen werden:
- Passwort-Policy (8 Zeichen, 3 Kategorien) – Backend prüft nur ≥4 Zeichen
- Observer-KK-Format (`/^\d{2}$/`)
- `maxlength`-Attribute auf HTML-Inputs
- Formular-Validierungen in `observation-form.js`

### 10.3 Fehlende Validierung (MITTEL)

- ~~Keine Server-seitige Validierung von Observation-Feldbereichen (EE: 1-99, MM: 1-12, TT: 1-31, etc.)~~ ✅ behoben 2026-03-07: `validate_observation()` prüft alle 22 Felder gemäß HALO_DATA_FORMAT-Spezifikation
- ~~`request.get_json()` Rückgabewert wird zwar geprüft (`or {}`), aber die Inhalte werden direkt genutzt~~ ✅ behoben: Validierung vor Persistierung in `add_observation()`
- ~~Keine Rate-Limiting auf Auth-Endpoints → Brute-Force möglich~~ ✅ behoben: Flask-Limiter (10/min Login, 5/min Password-Change), Session-Timeout 12h

---

## 11. Bugs

### 11.1 Kritisch

1. ~~**DB-Key zu kurz** (`observations_db.py`): 7-Tupel statt 9-Tupel → kann falschen Record updaten/löschen bei Mehrfach-Meldungen desselben Halo-Typs an einem Tag zu verschiedenen Uhrzeiten~~ ✅ behoben 2026-03-07

2. ~~**`save_many()` Transaktions-Bug** (`observations_db.py`): `rollback()` bei IntegrityError verwirft alle vorherigen Inserts der Transaktion~~ ✅ behoben 2026-03-07

### ~~11.2 Hoch~~ ✅ behoben 2026-03-08

3. ~~**Doppelte Event-Listener** (`analysis.js:1027-1043`): Event-Handler werden zweimal registriert → feuern doppelt bei jedem Change-Event~~ ✅ behoben

4. ~~**Doppelter Percentage-Mode-Block** (`analysis.js:1566-1575`): Identischer Code-Block direkt hintereinander dupliziert~~ ✅ behoben

5. ~~**Doppeltes `</button>`** (`monthly_report.html:105`): HTML-Parse-Error bei Print/Save-Buttons~~ ✅ behoben

### ~~11.3 Mittel~~ ✅ behoben 2026-03-08

6. ~~**`.focus` statt `.focus()`** (`monthly_report.js:218`): Property-Access statt Methoden-Aufruf → Focus wird nie gesetzt~~ ✅ behoben

7. ~~**`<td cass="text-end">`** (`analysis.js:2826`): Typo `cass` statt `class` → CSS-Klasse wird nicht angewendet~~ ✅ behoben

---

## 12. Verbesserungsvorschläge (priorisiert)

### Priorität 1 – Kritisch (sofort beheben)

| # | Maßnahme | Aufwand |
|---|---|---|
| 1 | ~~DB-Observation-Key um g, ZS, ZM erweitern (9-Tupel)~~ ✅ behoben 2026-03-07 | Mittel |
| 2 | ~~`save_many()` Transaktions-Handling fixen (SAVEPOINT)~~ ✅ behoben 2026-03-07 | Klein |
| 3 | ~~CSRF-Token für Cloud-Modus einführen (Flask-WTF)~~ ✅ behoben 2026-03-07 | Klein |
| 4 | ~~Zentrale `escapeHtml()` im JS + konsequent nutzen für alle API-Daten~~ ✅ behoben 2026-03-08 | Mittel |
| 5 | ~~Passwort-Policy Backend/Frontend angleichen (Backend ≥8 Zeichen + Kategorien)~~ ✅ behoben 2026-03-07 | Klein |

### Priorität 2 – Hoch (zeitnah)

| # | Maßnahme | Aufwand |
|---|---|---|
| 6 | ~~Upload-Passwort nicht im Klartext über API zurückgeben~~ ✅ behoben 2026-03-07 | Klein |
| 7 | ~~Observer-Liste vor Auth schützen~~ – Bewusste Entscheidung: Namen im Login-Dropdown gewünscht | – |
| 8 | ~~`/api/update` und `/api/restart` mit Auth absichern~~ ✅ behoben 2026-03-07 | Klein |
| 9 | ~~62 unnötige i18n-Fallbacks entfernen, fehlenden Key `annual_stats.table_totals` ergänzen~~ ✅ behoben 2026-03-07 | Klein |
| 10 | ~~Hardcodierte deutsche Texte in Charts durch i18n-Keys ersetzen~~ ✅ behoben 2026-03-07 | Klein |
| 11 | ~~Bug-Fixes: Doppelte Event-Listener, `.focus()`, CSS-Typo, doppeltes `</button>`~~ ✅ behoben 2026-03-08 | Klein |
| 12 | ~~`_format_parameter_value()`, `_format_*_html()`, `/file/autosave_old` entfernen~~ ✅ behoben 2026-03-07 | Klein |
| 13 | ~~Fehlendes `?v={{ static_version }}` auf allen JS/CSS-Includes ergänzen~~ ✅ behoben 2026-03-07 | Klein |
| 14 | ~~SQL-Parameter-Namen gegen Whitelist validieren in `build_analysis_sql()`~~ ✅ behoben 2026-03-07 | Klein |

### Priorität 3 – Mittel (geplant)

| # | Maßnahme | Aufwand |
|---|---|---|
| 15 | ~~`routes.py` in ~8 Dateien aufteilen~~ ✅ behoben 2026-03-07: Zentraler Blueprint in `__init__.py`, 12 Helper in `_helpers.py`, routes.py aufgeteilt in auth.py, general.py, observations.py, files.py, config.py, observers.py, statistics.py, analysis.py. routes.py entfällt. | Groß |
| 16 | ~~Service-Layer extrahieren (formatting.py, charts.py, statistics.py, solar.py)~~ ❌ Won't fix: Durch Maßnahme 15 (routes.py → 8 Domainmodule) bereits erledigt. Business-Logik (_format_*, _generate_*_chart, _calculate_*) wird jeweils nur vom eigenen Modul genutzt — ein separater Service-Layer würde Code nur verschieben ohne Mehrwert. | Groß |
| 17 | ~~Repository-Pattern für Cloud/Local-Abstraktion einführen~~ ❌ Won't fix: Analyse zeigt 22 `is_cloud_mode()`-Stellen in 3 Kategorien: 10× berechtigte Trennung (Auth/File-Ops nur in einem Modus), 8× gleiche Logik mit unterschiedlichem Backend (aber SQL-Optimierungen und Sortier-Asymmetrie verhindern saubere Abstraktion), 4× bereits kompakt (Ternary). Aufwand unverhältnismäßig für 2 fixierte Modi. | Groß |
| 18 | ~~Jinja Base-Template einführen (`{% extends 'base.html' %}`)~~ ✅ behoben 2026-07-12 | Mittel |
| 19 | ~~`kurzausgabe()` deduplizieren – eine Implementierung in shared utility~~ ✅ behoben 2026-07-12 | Klein |
| 20 | ~~Observer-Site-Formular als wiederverwendbare Komponente (1× statt 5×)~~ ✅ behoben 2026-03-07 | Mittel |
| 21 | Chart-Generierung zu einer parametrisierten Funktion vereinheitlichen | Mittel |
| 22 | ~~Menü-Highlighting über `data-page`-Attribut statt fragile Indices~~ ✅ behoben 2026-03-07 | Klein |
| 23 | ~~Regions-/Halotyp-Listen aus Backend-Constants beziehen statt im JS hardcoden~~ ✅ behoben 2026-03-07 | Klein |
| 24 | ~~Server-seitige Validierung aller Observation-Felder (Wertebereiche)~~ ✅ behoben 2026-03-07: `validate_observation()` komplett überarbeitet (alle 22 Felder + Abhängigkeiten), in `add_observation()` Route integriert | Mittel |
| 25 | ~~API Error-Response-Style vereinheitlichen (immer i18n-Keys)~~ ✅ behoben 2026-03-07 | Klein |

### Priorität 4 – Niedrig (wünschenswert)

| # | Maßnahme | Aufwand |
|---|---|---|
| 26 | ~~ES-Module-System für JavaScript einführen~~ ❌ Won't fix: Durch Maßnahme 27 (main.js → 6 Dateien via `<script>`-Tags) bereits gut strukturiert. ES-Module würden einen Bundler (Webpack/Vite) erfordern — unverhältnismäßig für eine Flask-App mit 6 JS-Dateien. | Groß |
| 27 | ~~`main.js` in ~5 dedizierte Module aufteilen~~ ✅ behoben 2026-03-07: main.js (9068→1060 Zeilen) aufgeteilt in observation-entry.js, observation-dialogs.js, file-operations.js, settings-dialogs.js, observer-management.js | Groß |
| 28 | ~~Rate-Limiting für Auth-Endpoints~~ ✅ behoben 2026-03-07 | Klein |
| 29 | ~~Session-Timeout konfigurieren~~ ✅ behoben 2026-03-07 | Klein |
| 30 | ~~Analyse-Engine: Strategy-Pattern pro Parameter-Typ statt Giant-Switch~~ ❌ Won't fix: Die ~10 Sonderfälle (TT, ZZ, SH, HO_HU, SE, C, EE, DD, JJ) bilden ein stabiles, abgeschlossenes Parameter-Set ab. if/elif-Ketten sind linear lesbar; ein Strategy-Pattern würde ~10 Klassen erzeugen die jeweils nur von einer Stelle aufgerufen werden. | Groß |
| 31 | ~~`console.log`-Debug-Statements entfernen (14 in main.js, 2 in observations.js)~~ ✅ behoben 2026-03-07: 3 console.log/debug in main.js entfernt (plotly.min.js unverändert) | Klein |
| 32 | ~~Alle verwaisten Funktionen und toten Code-Pfade entfernen~~ ✅ behoben 2026-03-07: `_parse_int()`, `updatePageText()`, `showMessage()`, `populateRegionSelect()`, auskommentiertes Export/Import entfernt | Klein |
| 33 | ~~Modal-Dialog-Factory einführen (statt 41× inline HTML)~~ ❌ Won't fix: Einfache Dialoge (Warning/Error/Confirm/Success/Info) bereits durch `modal-utils.js` vereinheitlicht. Verbleibende ~31 `insertAdjacentHTML` in main.js sind individuelle Formulardialoge (Zahleneingabe, Datei, Filter, Settings) mit eigener Struktur/Logik — eine generische Factory wäre unverhältnismäßig komplex. | Groß |

---

*Erstellt durch automatische Source-Code-Analyse am 2026-02-26*
