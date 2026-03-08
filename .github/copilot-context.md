# HALOpy — Architecture & Coding Guidelines

> **Authority**: Project team decisions
> **Process**: New decisions require explicit approval before being added
> **Note**: Originally created as ARCHITECTURE_DECISIONS.md during the Pascal→Python migration (completed 2026-02)

---

## Project Overview

**HALOpy** is a Python/Flask web application for recording and analyzing atmospheric halo observations. It succeeds the original DOS/Pascal program HALO, preserving the established data format and user workflow.

- Two deployment modes: **Local** (CSV files, single user) and **Cloud** (PostgreSQL, multi-user with authentication)
- Bilingual DE/EN with runtime language switching
- The HALO key observation record format is a **community standard — immutable**

---

## Deployment Modes — CRITICAL ARCHITECTURE

### Cloud Mode (`is_cloud_mode() = True`)
- **Authentication required** — users log in with username/password
- **User isolation**: Regular users see only their own observations (`session['observer_kk']`)
- **Admin**: `session['observer_kk'] = None` → full access to all data
- **Storage**: PostgreSQL — always direct database queries, no memory caching
- **Per-user config files**: `halo.44.cfg` for KK=44, `halo.admin.cfg` for admin
- **File operations disabled** (database-only)
- **Sorting**: Database ORDER BY (never Python `_spaeter()`)
- **State**: Use `session` (per-user) — never `app.config` for user-specific data
- **Write operations**: SQL UPDATE/INSERT/DELETE directly

### Local Mode (`is_cloud_mode() = False`)
- **No authentication** — full access to all loaded data
- **Storage**: CSV files loaded into `app.config['OBSERVATIONS']`
- **File operations enabled** (new, open, save, merge)
- **Sorting**: Python `_spaeter()` function (J→M→T→ZS→ZM→K→E→GG)
- **State**: `app.config` for application state
- **Write operations**: Delete + insert pattern (maintains CSV sort order)

### Critical Rules
- Cloud Mode must NEVER cache in `app.config`, NEVER use `obs_db.load_all()` for regular users, NEVER enable file operations
- Local Mode must NEVER require authentication, NEVER use database operations
- Detection: `from halo.config import is_cloud_mode`

### Cloud Mode Data Access — Decision #031
- Cloud: Always direct database queries (`observer_db.load_filtered()`, `obs_db.load_filtered()`)
- Local: Memory caching allowed (`app.config['OBSERVATIONS']`, `app.config['OBSERVERS']`)
- Cloud writes: SQL UPDATE (efficient, no sorting needed)
- Local writes: Delete + insert (maintains CSV sort order)

---

## Safety & Coding Standards

### Git Safety — Decision #028
- **NEVER** use `git checkout --` or `git restore` to overwrite entire working files
- **Required workflow**: `git diff` first → save to temp file → extract needed parts → apply targeted fixes
- Exception: Only when user explicitly requests full file restore

### No Blind String Replacement — Decision #027
- **NEVER** use regex-based string replacement across multiple files via terminal/scripts
- **ALWAYS** use `replace_string_in_file` / `multi_replace_string_in_file` tools with full context (3-5 lines before/after)
- Read file first, understand syntax, then replace

### Source Code Verification — Decision #032
- **NEVER** guess variable names, API signatures, or database schemas
- Always verify in actual source code: `scripts/setup_database.sql`, function definitions, existing field names

### Code Modification Policy — Decision #026
- **NEVER** regenerate/rewrite existing code blocks without explicit approval
- Always READ existing code first, then CORRECT the specific issue with minimal targeted changes
- Must ask before regenerating any function: "I need to regenerate [X] because [reason]. Approve?"

### Import Organization — Decision #030
All imports at top of file, no inline imports. Three groups separated by blank lines:
1. Standard library
2. Third-party (Flask, NumPy, etc.)
3. Project imports (`from halo.config import ...`)

Exception: Only for circular import problems that cannot be resolved by refactoring (must be documented).

### Debug Logging — Decision #024
- Label: `🔍 DEBUG:` prefix (Python `print()`, JavaScript `console.log()`)
- Must be single-line for easy regex removal
- Remove all debug statements before merging

---

## HALO Key Standard (IMMUTABLE)

The observation record format is a community standard that **cannot be changed**.

- **Format**: `KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH Sektoren Bemerkungen`
- **Documentation**: [HALO_DATA_FORMAT.md](../docs/HALO_DATA_FORMAT.md)
- **Sort order**: J → M → T → ZS → ZM → K → E → GG
- **Key dependencies**: d≥4 forces N=0/C=0; N=9 requires c≠0; E∈{8,9,10} requires height fields; E∈Sektor AND V=1 requires sector data
- **Sector notation**: `a-b-c e-f` — each visible octant explicitly listed with hyphens

---

## File Storage — Decision #025

CSV is the official HALOpy format. Binary format (.HAL/.BEO) will not be implemented.

- **Modern CSV**: Proper CSV with quoted remarks field for embedded commas
- **Legacy CSV**: Auto-detected and auto-converted to modern format on first save
- **Special value encoding**:
  - Empty/space = not observed → stored as `-1`
  - `/` = observed but not present → stored as `-2` (only d and 8HHHH fields)

---

## 4-Digit Year (JJ) — Decision #035

JJ is stored as 4-digit (e.g., 1988, 2025) internally everywhere. Convert only at storage boundaries:

| Boundary | Direction | Conversion |
|---|---|---|
| CSV/DB read | 2-digit → 4-digit | `jj_to_full_year()` |
| CSV/DB write | 4-digit → 2-digit | `% 100` |
| Eing string | 4-digit → 2-digit | `parseInt(jj) % 100` at positions 3-4 |
| Observer seit | 2-digit in MM/YY format | API normalizes on read/write |

Helpers in `constants.py`: `jj_to_full_year()`, `full_year_to_jj()`

---

## Internationalization (i18n)

### Scope — Decision #017
- **ALL user-visible text** must be in i18n — no exceptions
- Only technical identifiers (field codes like `KKOJJ`, `╔═══╗`) and debug output (`console.error(...)`) may be hardcoded
- Rule of thumb: if it's a word visible to users → i18n, no exceptions

### No Fallbacks — Decision #015
- Access i18n directly: `i18n.field` — never `i18n?.field || 'default'`
- Missing keys must cause immediate visible errors (fail fast)

### Direct Usage — Decision #023
- Use i18n strings directly at point of use: `i18nStrings.update.message.replace(...)` 
- Don't store in intermediate variables unless the same complex path is used multiple times

### Lockstep Maintenance — Decision #021
- `strings_de.json` and `strings_en.json` must always be updated together 
- Identical structure, key names, and ordering in both files

### Source Code Audit on Changes — Decision #022
- After any i18n key change: search entire codebase (`static/js/**/*.js`, `templates/**/*.html`, `src/**/*.py`) for all references and update them
- Missing references will cause runtime bugs

### Structure — Decision #020
Feature-based hierarchy:
```
common.*          - Reusable UI elements (ok, cancel, save, etc.)
menus.*           - Only actual menu item text
observations.*    - Everything observation-related (dialogs, forms, messages)
observers.*       - Everything observer-related
analysis.*        - Analysis functions
output.*          - Output/statistics
settings.*        - Settings
dialogs.*         - Generic dialogs (no_data, confirm, error)
errors.*          - General error messages
messages.*        - General info messages
app.*             - Application metadata (version, title)
```

Feature-specific strings belong in their feature namespace — not under `menus.*` or `dialogs.*`.

---

## UI Standards

### Button Standards — Decision #018
- All buttons: `btn-sm px-3`
- Order: Cancel (left) → OK (right)
- Button text from i18n: `common.ok`, `common.cancel`, `common.yes`, `common.no`
- Never use "Anwenden", "Apply", "Bestätigen" — always "OK"
- Colors: Cancel = `btn-secondary`, OK = `btn-primary`, destructive Yes = `btn-primary`

### Notifications — Decision #019
- Use `showNotification(message, type, duration)` for all temporary messages
- Types: `success` (green), `info` (blue), `warning` (yellow), `danger` (red)
- Position: Fixed top-center, auto-dismiss 3 seconds default

### Modal Architecture — Decision #033
- Use standard Bootstrap modals — no custom modal framework
- `setupModalKeyboard(modalEl, confirmBtn)` for Enter key support (skips `<textarea>`, `<select>`)
- `backdrop: 'static'` for ALL modals — clicking outside does NOT close
- Loading/spinner modals: additionally `keyboard: false` (blocks ESC)
- Clean up: Remove dynamically created modals from DOM on `hidden.bs.modal`
- Navigation-safe notifications: `sessionStorage.setItem('pendingNotification', ...)` before `navigateInternal()`
- Utility functions in `modal-utils.js`: `showWarningModal()`, `showErrorDialog()`, `showConfirmDialog()`, `showSuccessModal()`, `showInfoModal()`

### OK Button Activation — Decision #034
- OK button **disabled** until all mandatory fields are filled
- No click-to-validate-and-show-error pattern for simple field presence checks
- Error messages remain for complex validation (format errors, business rules, server errors)

---

## Data Handling Architecture — Decision #029

4-layer architecture:

1. **API Layer** (`src/halo/api/routes.py`) — REST endpoints for frontend communication
2. **Data Management** (`src/halo/io/observations.py`, `observers.py`) — Storage-agnostic business logic: CRUD, sorting, filtering, validation. Works with `List[Observation]` in memory.
3. **Storage Layer**:
   - **3a File Operations** (`observations_file.py`, `observers_file.py`) — CSV I/O
   - **3b Database Operations** (`observations_db.py`, `observers_db.py`) — SQL I/O for cloud mode
4. **Low-level I/O** (`csv_handler.py`) — CSV parsing

**Rule**: ALL data operations must go through `io` module functions. No direct file/DB access outside `io`.

**Key functions**: `make_observation_key()`, `add_observation()`, `update_observation()`, `delete_observation()`, `sort_observations()`, `filter_observations()`, `validate_observation()`

---

## Technology Stack

| Component | Choice | Decision |
|---|---|---|
| Language | Python 3.x | — |
| Framework | Flask | — |
| Frontend | HTML/Jinja2, Bootstrap, vanilla JavaScript | — |
| Data (local) | CSV files | #025 |
| Data (cloud) | PostgreSQL | — |
| i18n | JSON resource files, runtime switching | #010 |
| Python env | System Python, no venv | #012 |

### API Design — Decisions #013, #014
- All API parameters in request body (not URL path) — prevents encoding issues with special characters
- Verify every endpoint exists in backend before calling from frontend
- Exception: Simple resource IDs (integers) and pagination params may go in URL

### Language Architecture — Decision #010
- Session-based language management with server-side template rendering
- Templates: `{% if lang() == 'de' %}...{% else %}...{% endif %}`
- JavaScript: Load from `/api/language`, use `window.currentLanguage`
- Switching triggers full page reload for consistent server-side rendering

### Server-Side State — Decision #011
- All observation data stored server-side: `app.config` (local mode) or database (cloud mode)
- Client holds only temporary page-scoped cache (`window.haloData`)
- No observation data in localStorage or IndexedDB
- `app.config['DIRTY'] = True` tracks unsaved changes (local mode)

---

## Release Management

1. Update `app.version` and `app.version_date` in both `strings_de.json` and `strings_en.json`
2. Commit and push
3. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Create GitHub Release: `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`

Auto-update mechanism relies on tagged GitHub releases. See [AUTO_UPDATE.md](../docs/AUTO_UPDATE.md).

---

## UI/UX Decisions (Summary)

| # | Decision | Status |
|---|---|---|
| #001 | HTML5 file selector (unified open/folder) | ✓ Implemented |
| #002 | Python visualization libraries replace DOS BGI graphics | ✓ Approved |
| #003 | Browser printing (no custom printer drivers) | ✓ Approved |
| #004 | Unified header and footer across all pages | ✓ Implemented |
| #005 | Main page shows intro text when returning from functions | ✓ Implemented |
| #006 | Spinner/modal popup for long-running operations | ✓ Implemented |
| #007 | ESC key interrupts and returns to main window | ✓ Implemented |
| #008 | File-based architecture with explicit read/save/create and data loss warnings | ✓ Implemented |
| #009 | NEW: Display file name and record count in menu bar | ✓ Implemented |

---

## Project Structure

```
HALOpy/
├── halo.py                   # Application entry point
├── src/halo/
│   ├── models/               # Data structures, constants
│   ├── services/             # Business logic (observations, observers, analysis, validation)
│   ├── io/                   # Data I/O (CSV, database, observers)
│   ├── resources/            # i18n (strings_de.json, strings_en.json)
│   ├── api/                  # REST API routes
│   └── web/                  # Flask application
├── static/
│   ├── css/                  # Stylesheets
│   └── js/                   # Frontend JavaScript modules
├── templates/                # Jinja2 HTML templates
├── data/                     # CSV data files
├── resources/                # i18n JSON files
├── tests/                    # Test suite
├── docs/                     # Documentation
└── requirements.txt          # Python dependencies
```

---

*Last updated: 2026-03-08*
