# HALOpy Migration Project - Architecture & Decisions

> **📋 Documentation Type**: IMPLEMENTATION DECISIONS (Controlled)  
> **Status**: Requires explicit approval before adding new decisions  
> **Authority**: Project team decisions during migration  
> **Usage**: Reference for understanding implementation choices and rationale  
> **Process**: All new decisions must use Change Request Template and receive approval  
> **Note**: Previously named ARCHITECTURE_DECISIONS.md, renamed to copilot-context.md for GitHub Copilot integration

---

## Project Overview

**Source System**: HALO - DOS/Pascal halo observation recording system  
**Target System**: HALOpy - Python web application  
**Migration Start**: December 2025  
**Primary Goal**: Modernize the system while preserving data format, functionality, and user experience

**Decision: Web Application vs Desktop Client**  
**Rationale**: 
- No compilation needed - Python runs directly
- Cross-platform by design - works on any device with a browser
- Easy deployment - local server or cloud hosting
- Modern technology stack - easier to maintain and extend
- Better for collaboration - potential for shared data access

---

## Core Principles

### 0. No Automated String Replacement Across Multiple Files - Decision #027
- **Date**: 2026-01-31
- **Status**: ✓ Approved
- **Core Rule**: NEVER use regex-based string replacement across multiple files without manual verification
- **Prohibition**: Terminal commands like `Get-ChildItem | ForEach-Object { $content -replace ... }` are FORBIDDEN
- **Requirements**:
  1. ✗ **NEVER** use automated string replacement via terminal/scripts
  2. ✗ **NEVER** use regex replacements that don't account for full syntax context
  3. ✓ **ALWAYS** use `replace_string_in_file` or `multi_replace_string_in_file` tools
  4. ✓ **ALWAYS** include complete context (before/after lines) to ensure correct matching
  5. ✓ **ALWAYS** verify syntax correctness after replacement
- **Rationale**:
  - Regex cannot understand programming language syntax
  - Automated replacements cause syntax errors (missing parentheses, quotes, etc.)
  - Context-aware tools prevent such errors
  - Manual verification catches edge cases
- **Examples of FORBIDDEN patterns**:
  - ✗ `$content -replace "window\.location\.href = '/", "window.navigateInternal('/"`
  - ✗ Any PowerShell/bash script doing text replacement across multiple files
  - ✗ Global search-and-replace without syntax awareness
- **Correct approach**:
  - ✓ Use `replace_string_in_file` with full context (3-5 lines before/after)
  - ✓ Use `multi_replace_string_in_file` for multiple targeted replacements
  - ✓ Read file first, understand syntax, then replace with proper context
- **Impact**: Prevents syntax errors and broken code from blind string replacements

### 1. Code Modification Policy - Decision #026
- **Date**: 2026-01-25
- **Status**: ✓ Approved
- **Core Rule**: NEVER replace existing code with newly generated code without explicit approval
- **Critical Principle**: ALWAYS attempt to CORRECT existing code, never regenerate from scratch
- **Requirements**:
  1. ✓ **READ existing code first** - Understand what's already there
  2. ✓ **CORRECT the specific issue** - Make minimal, targeted changes
  3. ✓ **PRESERVE existing logic** - Keep all working code intact
  4. ✗ **NEVER regenerate code blocks** - This causes "lost updates" where previous fixes are lost
  5. ✗ **NEVER assume what code should look like** - Use actual existing code as base
- **When Regeneration Might Be Needed**:
  - **MUST ask explicitly first**: "I need to regenerate [function X] because [reason]. This will replace lines Y-Z. Approve?"
  - Wait for explicit user approval before proceeding
  - Provide clear diff showing what will be lost
- **Rationale**:
  - Prevents "lost updates" where previous bug fixes disappear
  - Avoids reintroducing bugs that were already fixed
  - Maintains code quality and consistency
  - Reduces rework and frustration
- **Examples**:
  - ✓ **Correct approach**: Read existing function → identify bug → fix specific line
  - ✗ **Wrong approach**: "I'll rewrite the function" → loses previous fixes
- **Impact**: This is a CRITICAL principle that prevents repeated debugging cycles

### 2. Debug Logging Standard - Decision #024
- **Date**: 2026-01-24
- **Updated**: 2026-01-27
- **Status**: ✓ Approved
- **Core Rule**: All debug/diagnostic output MUST be clearly labeled for easy identification and removal
- **Critical**: Debug statements MUST be on a SINGLE LINE and removable by simple regex
- **Labeling Convention**:
  - Python: Single line: `print(f"🔍 DEBUG: {var1}={value1}, {var2}={value2}")` (NOT multi-line)
  - JavaScript: Single line: `console.log("🔍 DEBUG: field=", fieldValue, "state=", stateValue);` (NOT multi-line)
  - HTML templates: Single line: `<!-- DEBUG: message -->` (NOT multi-line)
- **Single Line Rule**:
  - ✓ MUST fit on one line (if line is too long, use string concatenation or split debug data)
  - ✗ NEVER split debug statements across multiple lines
  - ✗ NEVER use line breaks within debug statements
  - Purpose: Enable removal via simple PowerShell regex: `'s*console\.log.*🔍 DEBUG.*);?\n?'`
- **Purpose**: Enable temporary debugging without polluting production code
- **Removal**: Search for `DEBUG:` or `🔍` to find all debug statements before merging
- **Example Python (✓ CORRECT)**:
  ```python
  print(f"🔍 DEBUG: kk={kk}, mm={mm}, jj={jj}, active={data.active}")
  ```
- **Example Python (✗ WRONG - multi-line)**:
  ```python
  print("🔍 DEBUG: kk={kk}, mm={mm}")  # Line 1
  print("🔍 DEBUG: jj={jj}, active={data.active}")  # Line 2
  # This is OKAY only if each line is removable independently
  ```
- **Example JavaScript (✓ CORRECT)**:
  ```javascript
  console.log("🔍 DEBUG: constraints for", fieldKey, ":", constraints, "allowed=", allowedCount, "total=", totalOptions);
  ```
- **Example JavaScript (✗ WRONG - multi-line)**:
  ```javascript
  console.log("🔍 DEBUG: Starting update");  // Line 1
  // ... code ...
  console.log("🔍 DEBUG: Done");  // Line 2
  // Each line needs to be on its own line so regex can find it
  ```

### 3. Observation Record Format (HALO Key)
- **Decision**: ✓ Preserve standardized observation record format exactly
- **Format**: `KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH Sektoren Bemerkungen`
- **Rationale**: 
  - Standardized format defined independently of HALO program
  - Used by observation community for decades
  - Cannot be changed - this is a standard, not a design decision
- **Status**: ✓ Fixed (not changeable)
- **Documentation**: See [HALO_DATA_FORMAT.md](HALO_DATA_FORMAT.md)

### 2. Observation Record Format (HALO Key)
- **Decision**: ✓ Preserve standardized observation record format exactly
- **Format**: `KKOJJ MMTTg ZZZZd DDNCc EEHFV fzzGG 8HHHH Sektoren Bemerkungen`
- **Rationale**: 
  - Standardized format defined independently of HALO program
  - Used by observation community for decades
  - Cannot be changed - this is a standard, not a design decision
- **Status**: ✓ Fixed (not changeable)
- **Documentation**: See [HALO_DATA_FORMAT.md](HALO_DATA_FORMAT.md)

### 3. File Storage Format - Decision #025
- **Decision**: ✓ CSV format is the official HALOpy format
- **Date**: 2026-01-25
- **Status**: ✓ Finalized - binary format will not be implemented
- **Format**: 
  - **Modern CSV**: Proper CSV with quoted remarks field to handle embedded commas
  - **Legacy CSV**: Compatible with CSV exports from original HALO program (auto-converts)
- **Legacy Compatibility**: 
  - HALOpy can read legacy CSV format (fixed positions with spaces)
  - Auto-converts to modern format on first save
  - Detection: Legacy format has spaces (leading or trailing) in sectors field
- **Modern Format Specification**:
  - No spaces between commas
  - No leading zeros (except where semantically required)
  - Remarks field enclosed in double quotes when needed: `"remark text, with commas"`
  - Standard CSV escaping: quotes within remarks doubled (`""`)  
  - All other fields unquoted (numeric or simple text)
- **Special Value Encoding**:
  - Empty or space = not observed/unknown → stored as `-1` (most fields)
  - `/` = observed but not present → stored as `-2` (only for d and 8HHHH fields)
  - **Critical**: Most fields have their own "not present" values (usually 0). Only d (cirrus density) and 8HHHH (light pillar) use `/` (-2) for "observed but not present"
- **Rationale**:
  - Binary format reason (disk space on floppies) no longer relevant
  - CSV is open, portable, human-readable
  - Easier integration with other tools (Excel, Python, R)
  - Users already converted files using HALO.EXE CSV export
  - Simpler maintenance and debugging
- **Documentation**: See [HALO_DATA_FORMAT.md](HALO_DATA_FORMAT.md) for record structure and special value semantics

### 4. Maintain User Experience (UPDATED - 2026-01-25)
- **Decision**: Preserve proven workflow and familiar UI while allowing modern improvements
- **Rationale**: 
  - ✓ Migration completed - original functionality successfully ported
  - Preserve user familiarity with established workflows
  - Allow incremental improvements and modernization
- **Status**: Active principle - continuous improvement phase
- **Applies to**:
  - Menu structure and functions (30 years of user familiarity)
  - Display formats and data validation
  - All texts and translations (use original texts, allow refinements with approval)

### 5. Controlled Evolution
- **Decision**: No function omission or new features without explicit approval
- **Rationale**: Prevent scope creep and maintain focus on faithful migration
- **Process**: All changes must be:
  1. Proposed with rationale
  2. Explicitly approved
  3. Documented in this file
- **Status**: Active principle

### 5. Bilingual Support (DE/EN)
- **Decision**: Full bilingual support using i18n framework
- **Rationale**: Original system is bilingual; users span German and English-speaking regions
- **Requirements**:
  - All UI text must exist in both languages
  - Language switching must be possible at any time
  - Use original German and English texts from Pascal source
- **Status**: ✓ Implemented
- **Implementation**: JSON resource files in `resources/` directory

### 5a. Internationalization (i18n) Scope - Decision #017
- **Date**: 2026-01-10 (Updated: 2026-01-27)
- **Status**: ✓ Approved
- **Core Principle**: **ALLE statischen Texte MÜSSEN in i18n - KEINE Ausnahmen außer technische Identifier!**
- **What MUST be in i18n** (everything except technical identifiers):
  - ✓ **ALL user-visible text**: labels, messages, titles, prompts, buttons, menu items
  - ✓ **ALL error messages, warnings, confirmations**
  - ✓ **ALL table headers, column names** (even technical ones if user-facing)
  - ✓ **ALL help text, descriptions, explanations**
  - ✓ **ALL words used in UI logic**: conjunctions ("und"/"and"), articles, prepositions
  - ✓ **Rule of thumb**: If it's a word or text visible to users → i18n, no exceptions
- **What CAN stay hardcoded** (ONLY technical identifiers):
  - ✓ Technical data format identifiers: `KKOJJ MMTTg`, `ZZZZd DDNCc` (field codes)
  - ✓ Pseudographic/box-drawing characters: `║`, `╔`, `═`, `├`, `─` (table structure)
  - ✓ Field position markers in technical output (when reproducing original format exactly)
  - ✓ **Critical rule**: If it's NOT a data format identifier → it MUST be in i18n!
- **Fail Fast Rule** (Decision #015):
  - No fallbacks: `i18n?.field || 'default'` is **FORBIDDEN**
  - All i18n fields accessed directly: `i18n.field`
  - Missing i18n keys cause immediate errors (intended behavior)
  - This prevents silent failures and ensures consistency
- **Examples**:
  - ✓ **MUST be i18n**: "Tag", "Sonne", "Monatsmeldung", "Fehler beim Laden", "und", "and"
  - ✓ **Can be hardcoded**: `║ KKOJJ MMTTg ║`, `╠═══╬═══╣`, `KKOJJ MMTTg ZZZZd DDNCc`
  - ✗ **WRONG**: `Tag` hardcoded in JavaScript for HTML output
  - ✗ **WRONG**: `i18n.months || ['Jan', 'Feb', ...]` fallback pattern
  - ✗ **WRONG**: Hardcoded "und" or "and" instead of `i18n.common.and`
- **Implementation Guidelines**:
  - **Default assumption**: ALL text → i18n (unless proven to be technical identifier)
  - If it's a word humans read → i18n key
  - If it's a technical code like "KKOJJ" → hardcoded
  - Always access i18n without optional chaining or fallbacks

### 6. Code Reuse and DRY Principle
- **Decision**: Always reuse existing code, data structures, and patterns instead of duplicating
- **Rationale**: 
  - Reduces maintenance burden - changes in one place propagate everywhere
  - Prevents inconsistencies between different parts of the codebase
  - Ensures uniform behavior across features
  - Easier to understand and modify
- **Requirements**:
  - Before implementing any feature, search for existing similar code
  - Reuse existing:
    - **Alerts/dialogs**: Use established warning/error patterns (e.g., "no data loaded" modal)
    - **Constants**: Use i18n strings for geographic regions, halo types, months, etc.
    - **Functions**: Observer filters, data validation, formatting functions
    - **UI components**: Bootstrap modals, buttons, input patterns
    - **API patterns**: Response formats, error handling, parameter validation
- **Examples**:
  - Geographic regions: Use `i18n.geographic_regions` instead of hardcoding region arrays
  - Warning dialogs: Use `showWarningModal()` pattern from existing pages
  - Observer selection: Reuse observer dropdown and filter logic
  - Date validation: Reuse existing month/year validation functions
- **Status**: Active principle
- **Anti-patterns to avoid**:
  - Hardcoding data that exists in i18n files
  - Reimplementing dialogs/modals with different styles
  - Creating new validation logic for data already validated elsewhere
  - Writing custom formatters for standardized fields

### 6a. i18n Changes Require Source Code Audit - Decision #022
- **Date**: 2026-01-18
- **Status**: ✓ Approved
- **Core Rule**: ANY change to i18n files (strings_de.json, strings_en.json) MUST be immediately followed by a complete source code audit
- **Rationale**:
  - i18n keys are referenced throughout JavaScript, templates, and Python code
  - Renaming or removing an i18n key will cause undefined key errors at runtime
  - Silent failures can occur if code references non-existent keys
- **Procedure When Changing i18n**:
  1. **Before** making ANY change to i18n files:
     - Document the old key name
     - Plan which source files need updates
  2. **After** making i18n changes:
     - Search entire codebase for references to changed keys:
       - `static/js/**/*.js` - JavaScript files
       - `templates/**/*.html` - HTML templates  
       - `src/**/*.py` - Python backend
       - `src/halo/**` - All application code
     - Update ALL references to match new key names
     - Test application to verify no errors in console or UI
  3. **Tools**:
     - Use `grep_search` with regex to find all references: `i18n(Strings)?\.old_key_name`
     - Search both English and German keys consistently
- **Examples of Breaking Changes**:
  - Removing `analysis_results.restrictions` without updating 6 JavaScript references = 6 broken UI elements
  - Renaming `common.year` to `common.jahr` in just one file = runtime errors in other file
- **Critical**: This is NOT optional. Missing references will cause bugs that only appear at runtime.
- **Related**: Decision #021 (lockstep DE/EN maintenance), Decision #015 (fail fast principle)

### 7. No Fallback Values - Fail Fast
- **Decision #015**: Never use fallback values or default data - fail explicitly when data is missing
- **Date**: 2026-01-04
- **Status**: ✓ Approved
- **Rationale**:
  - Makes problems visible immediately rather than masking them
  - Easier to debug - errors point directly to missing data
  - Prevents silent failures that can go unnoticed for long periods
  - Forces proper implementation of i18n and data structures
- **Core Rules**:
  1. ✗ **NEVER** use optional chaining with fallbacks: `i18n?.months || ['default']`
  2. ✓ **ALWAYS** access data directly: `i18n.months`
  3. ✗ **NEVER** provide fallback strings in templates or JavaScript
  4. ✓ **ALWAYS** let code fail if required data is missing
- **Examples**:
  - ✗ Wrong: `const months = i18n?.months || ['Januar', 'Februar', ...]`
  - ✓ Correct: `const months = i18n.months`
  - ✗ Wrong: `i18n.dialogs?.no_data?.message || 'No data'`
  - ✓ Correct: `i18n.dialogs.no_data.message`
- **Benefits**:
  - Missing i18n keys cause immediate errors in development
  - Missing API fields cause immediate errors that get fixed
  - No silent degradation of functionality
  - Code is cleaner without fallback logic everywhere
- **Status**: Active principle

### 8. Direct i18n Usage - No Intermediate Constants
- **Decision #023**: Use i18n strings directly, never store in intermediate constants
- **Date**: 2026-01-24
- **Status**: ✓ Approved
- **Rationale**:
  - Reduces unnecessary variable declarations
  - Makes code more readable and maintainable
  - Clearer what string is being used at point of use
  - Prevents confusion about whether variable has been modified
  - Consistent with fail-fast principle (Decision #015)
- **Core Rules**:
  1. ✗ **NEVER** store i18n strings in intermediate variables: `const msgTpl = i18nStrings.update.message;`
  2. ✓ **ALWAYS** use i18n strings directly: `i18nStrings.update.message.replace(...)`
  3. ✗ **NEVER** create constants that just reference other i18n constants
  4. ✓ **ONLY** exception: When the same complex i18n path is used multiple times in tight scope
- **Examples**:
  - ✗ Wrong: `const msgTpl = i18nStrings.update.message; showDialog(title, msgTpl.replace(...))`
  - ✓ Correct: `showDialog(title, i18nStrings.update.message.replace('{latest}', latest))`
  - ✗ Wrong: `const title = i18nStrings.dialogs.confirm.title; const msg = i18nStrings.dialogs.confirm.message;`
  - ✓ Correct: `showConfirmDialog(i18nStrings.dialogs.confirm.title, i18nStrings.dialogs.confirm.message)`
- **Benefits**:
  - Cleaner code with fewer variable declarations
  - Obvious what string is being used without looking up variable definition
  - No risk of accidentally using wrong variable name
  - Easier to search for i18n key usage in codebase
- **Status**: Active principle

---

## Technology Stack Decisions

### Programming Language
- **Decision**: Python 3.x
- **Rationale**: 
  - Modern, maintainable
  - Excellent library support
  - Cross-platform
- **Status**: ✓ Approved

### Application Architecture
- **Decision**: Web application (Flask framework)
- **Rationale**:
  - Cross-platform compatibility
  - No installation required
  - Modern UI possibilities while maintaining familiar workflow
  - Easier deployment and updates
- **Status**: ✓ Approved

### Python Environment Management
- **Decision #012**: Do not use virtual environments (venv) for HALOpy
- **Date**: 2025-12-25
- **Status**: ✓ Approved
- **Rationale**:
  - Team decision: simplify setup for contributors and target machines
  - Aligns with original HALO's minimal installation philosophy
  - Avoids environment confusion for non-developer users in labs
- **Implications**:
  - Installation instructions use system Python directly
  - Dependencies installed with `pip install -r requirements.txt` on the system
  - Scripts, docs, and tooling must not assume an activated venv
- **Trade-offs**:
  - ✓ Simpler onboarding for users without Python tooling experience
  - ✗ Less isolation; be mindful of system-wide package versions
- **Operational Rules**:
  1. ✓ Documentation MUST NOT include venv creation/activation steps
  2. ✓ CI/CD and deploy scripts MUST use system Python or containerized runtimes
  3. ✗ Do NOT add `pyproject.toml`/`pipenv`/`poetry` environment activation requirements without a new approved decision
  4. ✓ If isolation is needed for a specific deployment, use containers (separate decision) rather than venv

### Binary File I/O
- **Decision**: CONDITIONAL - depends on File Storage Format decision (Principle #2)
- **If Binary Format chosen**: Python `struct` module for binary file operations
- **If CSV Format chosen**: Standard CSV parsing, no binary I/O needed
- **Rationale**: Binary I/O only required if keeping original compressed binary format
- **Status**: Pending (awaiting File Storage Format decision)
- **Location**: `src/halo/io/` module
- **Note**: Some binary I/O implementation exists for analysis/testing purposes

### API Design Principles

#### Decision #014: REST API Parameter Passing
- **Decision**: All API parameters must be passed in the request body, not in the URL path
- **Date**: 2025-12-30
- **Status**: ✓ Approved - enforced after URL encoding issues with site management
- **Rationale**:
  - Prevents URL encoding issues (e.g., slash in "04/26" interpreted as path separator)
  - More RESTful and consistent API design
  - Easier to extend with additional parameters
  - Cleaner code without encodeURIComponent() workarounds
  - Matches industry best practices for REST APIs
- **Core Rules**:
  1. ✓ **Resource identifiers** go in URL path (e.g., `/api/observers/44`)
  2. ✓ **All other parameters** go in request body as JSON
  3. ✓ **PUT/DELETE**: Include identifying parameters in body, not URL
  4. ✗ **NEVER** pass data parameters in URL query strings or path segments
- **Examples**:
  - ✓ **Correct**: `PUT /api/observers/44/sites` with body `{"originalSeit": "04/26", "seit_month": 5, ...}`
  - ✗ **Wrong**: `PUT /api/observers/44/sites/04/26` (requires URL encoding)
  - ✓ **Correct**: `DELETE /api/observers/44/sites` with body `{"seit": "04/26"}`
  - ✗ **Wrong**: `DELETE /api/observers/44/sites/04/26` (requires URL encoding)
  - ✓ **Correct**: `PUT /api/observers/44` with body `{"VName": "...", "NName": "..."}`
- **Exceptions**: 
  - Resource IDs that are simple integers or alphanumeric codes (e.g., observer KK)
  - Pagination parameters for GET requests (`?limit=100&offset=0`)
- **Related**: This decision complements #013 (API Endpoint Usage Policy)

#### Decision #013: API Endpoint Usage Policy
- **Decision**: All API endpoints must be verified before use in frontend code
- **Date**: 2025-12-29
- **Status**: ✓ Approved - enforced after duplicate observation bug (2899 count incident)
- **Rationale**:
  - Prevent silent failures when calling non-existent endpoints
  - Catch parameter mismatches early in development
  - Improve debugging and code quality
  - Avoid optimistic API calls without backend implementation
  - Discovered critical issue: frontend called `/api/observations/delete` without verifying it existed in backend
- **Core Rules**:
  1. ✓ **BEFORE** writing JavaScript code that calls an API endpoint:
     - Inspect the backend source code to verify the endpoint exists
     - Verify the HTTP method (GET, POST, DELETE, etc.)
     - Verify parameter names, types, and expected response format
  2. ✓ **BEFORE** calling an endpoint from the frontend:
     - Create the backend endpoint if it doesn't exist
     - Test it separately using curl/Postman before integrating into JS
  3. ✓ Add debug logging to capture requests, responses, and error conditions
  4. ✗ **NEVER** call an endpoint without first verifying it exists and its parameters
  5. ✗ **NEVER** assume parameter names - always match actual backend implementation
- **Implementation Guidelines**:
  - **Backend**: All API endpoints documented in `src/halo/api/routes.py`
  - **Frontend**: Debug logs must show endpoint, method, parameters, response status
  - **Testing**: Use browser Developer Tools to verify requests before merging code
  - **On Failure**: Check console logs for endpoint existence error before debugging data flow
  - **Code Review**: Check that every API call in JS has corresponding implementation in Python
- **Example - Observation Deletion**:
  - Endpoint: POST `/api/observations/delete` (lines 285-319 in routes.py)
  - Parameters: Object with KK, O, JJ, MM, TT, EE, GG fields
  - Response: `{"success": true/false, "deleted": true/false, "count": n}`
  - Called from: `main.js` line 2009 in `showObservationFormForEdit()`
- **Related Principles**: Applies to all inter-system communication (frontend↔backend, backend↔database)
- **Impact**: This principle prevents bugs and improves code quality during active development

### Internationalization
- **Decision**: JSON-based i18n with runtime language switching
- **Rationale**: 
  - Simple, maintainable
  - Easy to extract from Pascal source
  - Runtime switching without restart
- **Status**: ✓ Implemented
- **Files**: 
  - `resources/strings_de.json`
  - `resources/strings_en.json`

### Language Handling Architecture
- **Decision #010**: Session-based language management with server-side template rendering
- **Date**: 2025-12-24
- **Status**: ✓ Implemented

**Architecture Overview**:
1. **Server-Side Session Storage**: Language preference stored in Flask session (survives page reloads)
2. **Template Integration**: All templates use `{% if lang() == 'de' %}...{% else %}...{% endif %}` for bilingual content
3. **API Endpoints**: 
   - `GET /api/language` - Get current session language
   - `POST /api/language/<lang>` - Set session language
   - `GET /api/i18n/<lang>` - Get all strings for JavaScript (fallback/dynamic content)
4. **Page Reload Pattern**: Language switching triggers full page reload for consistent server-side rendering
5. **Middleware**: `@app.before_request` sets up language context for each request
6. **Context Processor**: Makes `_()`, `lang()`, and `i18n` available in all templates

**Implementation Details**:
- **Session Management** (`src/halo/resources/i18n.py`):
  - `set_language(lang)`: Updates both i18n instance AND Flask session
  - `get_current_language()`: Reads from Flask session with fallback to i18n instance
  - `get_i18n(language)`: Returns global i18n instance, reloads if language changed
- **Flask Integration** (`src/halo/web/app.py`):
  - `@app.before_request`: Initializes session language from browser if not set
  - `@app.context_processor`: Injects translation functions into all templates
  - Stores current language in `g.language` for request-scoped access
- **Template Pattern** (all `.html` files):
  - Language-aware HTML lang attribute: `<html lang="{{ lang() }}">`
  - Bilingual content blocks: `{% if lang() == 'de' %}German{% else %}English{% endif %}`
  - Server-rendered language buttons: `class="btn {% if lang() == 'de' %}btn-light{% else %}btn-outline-light{% endif %}"`
- **Client-Side** (`static/js/main.js`):
  - Loads current language from server on page load via `/api/language`
  - Language switching: POST to `/api/language/<lang>`, then `window.location.reload()`
  - localStorage used only as backup, session is source of truth

**Rationale**:
- **Progressive Enhancement**: Works without JavaScript (server renders correct language)
- **Consistent State**: Session ensures language persists across pages and reloads
- **Simple Mental Model**: One source of truth (session), templates always in sync
- **Best Practice**: Follows Flask-Babel pattern without adding dependency
- **Reliable**: Page reload eliminates complex client-side state synchronization issues

**Critical Implementation Rules**:
1. ✓ **ALL new pages/templates MUST**:
   - Use `lang="{{ lang() }}"` in `<html>` tag
   - Use `{% if lang() == 'de' %}...{% else %}...{% endif %}` for all user-visible text
   - Include both German and English versions of ALL text
2. ✓ **ALL new routes MUST**:
   - NOT set language independently
   - Use `get_current_language()` to read session language
   - Let `@app.before_request` handle language setup
3. ✓ **ALL new JavaScript MUST**:
   - Load language from `/api/language` endpoint, NOT localStorage
   - Use `window.currentLanguage` global variable
   - Call existing `switchLanguage(lang)` function, don't reimplement
4. ✗ **NEVER**:
   - Hardcode language in templates or routes
   - Use only German OR only English text
   - Implement custom language switching logic
   - Store language state outside Flask session (except localStorage backup)

### Data Management Architecture
- **Decision #011**: Server-side data storage and state management
- **Date**: 2025-12-24
- **Status**: ✓ Implemented

**Architecture Overview**:
All observation data, loaded files, and application state are stored server-side in Flask's `app.config`, not client-side. The client (browser) only maintains minimal state for UI interactions.

**Implementation Details**:
- **Server Storage** (`app.config`):
  - `OBSERVATIONS`: List of all loaded observation records
  - `LOADED_FILE`: Name of currently loaded file
  - `DIRTY`: Flag indicating unsaved changes
  - `INPUT_MODE`: Display mode setting (Number entry 'N' vs Menu entry 'M')
  - `ACTIVE_OBSERVERS_ONLY`: Filter to active observers only
- **Client Storage** (minimal):
  - `window.haloData`: Temporary cache for current page (lost on navigation)
  - `localStorage`: Only for language preference backup
  - No observation data stored client-side persistently
- **API Pattern**:
  - `/api/observations`: Returns data from `app.config['OBSERVATIONS']`
  - If not loaded yet, reads from file and stores in `app.config`
  - Data persists across page navigation within same session
  - File operations update `app.config` immediately

**Rationale**:
- **Single Source of Truth**: Server always has authoritative state
- **Memory Efficiency**: Browser doesn't need to hold large datasets
- **Consistency**: All pages see same data without synchronization complexity
- **Session Persistence**: Data survives page reloads and navigation
- **Simplicity**: No client-side storage/caching logic needed
- **Scalability**: Easier to add multi-user support in future

**Critical Implementation Rules**:
1. ✓ **ALL data mutations MUST**:
   - Update `app.config['OBSERVATIONS']` on server
   - Set `app.config['DIRTY'] = True` when data changes
   - Return updated state in API response
2. ✓ **ALL page loads MUST**:
   - Fetch data from `/api/observations` endpoint
   - NOT store observations in localStorage or IndexedDB
   - Use `window.haloData` only as temporary page-scoped cache
3. ✓ **File operations MUST**:
   - Update `app.config['LOADED_FILE']` when loading/saving
   - Clear `app.config['OBSERVATIONS']` when closing file
   - Prompt for save if `app.config['DIRTY'] = True`
4. ✗ **NEVER**:
   - Store observation data in client-side storage
   - Assume client state is persistent across navigation
   - Bypass server for data modifications
   - Cache large datasets in browser memory

**Trade-offs**:
- ✓ **Gains**: Simplicity, consistency, easy state management
- ✓ **Gains**: Foundation for future multi-user/cloud features
- ✗ **Costs**: Requires server running (not pure static site)
- ✗ **Costs**: Network requests for each page navigation (minimal for local server)

---

## UI/UX Decisions

### File Operations
- **Decision #001**: Use modern HTML5 file selector for both file selection and folder navigation
- **Original Behavior**: Separate "Change Folder" and "Open File" functions
- **New Behavior**: Unified file selector element
- **Rationale**: 
  - Standard web browser behavior
  - More intuitive for modern users
  - Reduces UI complexity
- **Trade-off**: 
  - Loss of explicit "change folder" command
  - Loss of "default folder" preference setting (browser file selector always starts with recently used folder)
- **Impact**: Medium - users must navigate to desired folder each session, but browser remembers last location
- **Approved**: Implicit (standard web pattern, no alternative available)
- **Status**: ✓ Implemented

### Data Display
- **Decision**: Maintain original display formats, layouts, and field positions
- **Rationale**: Preserve familiar user experience
- **Status**: In Progress
- **Note**: Web rendering may differ from DOS text mode but should maintain same information density and logical grouping

### Page Structure
- **Decision**: Unified header and footer across all pages
- **Rationale**: Ensure consistency between all pages in web application
- **Status**: ✓ Implemented

### Main Page Behavior
- **Decision**: Main page shows intro text when returning from functions
- **Original Behavior**: Main page populated with content (observations lists, statistics, analyses)
- **New Behavior**: Content is displayed only when actively working, intro text shown when returning to main
- **Rationale**: Clear distinction between active work and navigation state
- **Status**: ✓ Implemented

### Progress Indication
- **Decision**: Display spinner in modal popup for long-running operations
- **Behavior**: the headline KKOJJ MMTTg ... and the input window must be aligned, so that I see which value I currently enter
  - Popup window with status message (e.g. "file is loading")
  - Background is greyed out (modal overlay)
  - Prevents other interactions while operation in progress
- **Rationale**: Provide clear user feedback for functions that may take time
- **Status**: ✓ Implemented

### Standard Modal Dialog Layout
- **Decision #011**: All modal dialogs must use consistent layout pattern
- **Date**: 2025-12-25
- **Status**: ✓ Implemented

**Required Layout Pattern**:
```javascript
// Dialog wrapper - full-screen overlay with centered content
const dialog = document.createElement('div');
dialog.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;';

// Content box - white background with rounded corners
const content = document.createElement('div');
content.style.cssText = 'background: white; padding: 20px; border-radius: 8px; min-width: 400px;';

// Standard button layout - right-aligned, Cancel before OK
// Cancel: default style with margin-right
// OK: blue background (#007bff), white text
```

**Key Elements**:
1. **Full-Screen Overlay**: Dark semi-transparent background (rgba(0,0,0,0.5))
2. **Centered Content**: White box with 20px padding and 8px border radius
3. **Button Order**: Cancel button (left) before OK button (right)
4. **Button Styling**: 
   - Cancel: Default style, 10px right margin
   - OK: Blue background (#007bff), white text, no border
5. **Keyboard Support**: ESC key closes dialog, Enter key activates OK button
6. **Focus Management**: OK button gets initial focus

**Applies To**:
- New file dialog (`showNewFileDialog`)
- Error dialogs (`showErrorDialog`)
- Settings dialogs (`showEingabeartDialog`)
- All future custom dialogs

**Rationale**:
- Ensures visual consistency across all dialogs
- Familiar interaction pattern for users
- Professional appearance
- Easy to maintain and replicate

**Critical Rules**:
- ✓ NEVER use custom positioning (transform: translate, absolute positioning)
- ✓ NEVER use custom colors (blue borders, colored backgrounds on wrapper)
- ✓ ALWAYS use flexbox centering for dialog wrapper
- ✓ ALWAYS include ESC key handler
- ✗ DO NOT mix patterns - use this exact layout for all custom dialogs

### Keyboard Navigation
- **Decision**: ESC key interrupts current function and returns to main window
- **Original Behavior**: ESC interrupts operation and returns to main
- **New Behavior**: Same - ESC interrupts and returns to main window
- **Rationale**: Preserve familiar navigation pattern
- **Status**: ✓ Implemented

### File Status Display (NEW FEATURE)
- **Decision #009**: Display file name and record count in menu bar
- **Original Behavior**: Not available in original program
- **New Behavior**: Right end of menu bar shows:
  - Name of currently loaded file
  - Number of records in file
- **Rationale**: Provides immediate context about current working file
- **Impact**: Low - additive feature, does not change existing functionality
- **Status**: ✓ Approved and Implemented

---

## Data Handling Decisions

### Observer Database
- **Decision**: Maintain multiple records per observer with validity dates
- **Original Format**: Binary file with records sorted by (K, seit)
- **Preserved**: Exact record structure and sorting algorithm
- **Status**: ✓ Documented
- **Reference**: See [HALO_DATA_FORMAT.md § Observer Record Structure](HALO_DATA_FORMAT.md#observer-record-structure-beobachter)

### Observation Records
- **Decision**: Preserve 8-level sort order
- **Sort Criteria**: J → M → T → ZS → ZM → K → E → gg
- **Rationale**: Ensures consistent data file organization
- **Status**: ✓ Documented
- **Implementation**: Must implement `spaeter()` function equivalent

### File-Based Architecture
- **Decision**: File-based data management (not database-based)
- **Original Behavior**: Explicit functions for file operations
- **Operations**:
  - **Read Data**: Explicit function to read observations from disk into memory
  - **Save Data**: Explicit function to save observations from memory to disk
  - **Create New**: Explicit function to create new empty files
- **Data Loss Prevention**:
  - Warning when unsaved changes exist before loading new file
  - Warning when file data was modified but not yet saved
  - User must confirm actions that may cause data loss
- **Rationale**: 
  - Preserves original workflow where users explicitly control file operations
  - Maintains clear separation between in-memory and on-disk data
  - Prevents accidental data loss through explicit save operations
- **Status**: ✓ Documented, Implementation pending

---

## HALO Key Standard Requirements

These are NOT decisions - they are fixed requirements from the HALO key observation standard and cannot be changed.

### Field Dependencies
- **Source**: HALO key standard (independent of program implementation)
- **Examples**:
  - d ≥ 4 forces N=0, C=0
  - N=9 requires c ≠ 0
  - E ∈ {8,9,10} requires height fields
  - E ∈ Sektor AND V=1 requires sector data
- **Status**: ✓ Documented, Implementation pending
- **Reference**: [HALO_DATA_FORMAT.md § Field Dependencies](HALO_DATA_FORMAT.md#field-dependencies-summary)

### Sector Notation
- **Source**: HALO key standard (independent of program implementation)
- **Format**: `a-b-c e-f` (octants a,b,c and e,f visible)
- **Clarification**: Each visible octant is explicitly listed with hyphens
- **Status**: ✓ Documented
- **Reference**: [HALO_DATA_FORMAT.md § Field 21 - Sectors](HALO_DATA_FORMAT.md#21-sektoren---sectors)

---

## Validation Decisions

### Data Validation
- **Decision**: Implement all original validation rules exactly
- **Includes**:
  - Required fields
  - Value ranges
  - Invalid combinations
  - Conditional requirements
- **Status**: ✓ Documented, Implementation pending
- **Reference**: [HALO_DATA_FORMAT.md § Data Validation Rules](HALO_DATA_FORMAT.md#data-validation-rules)

### Year Handling
- **Decision**: Preserve 2-digit year with century inference
- **Rule**: Year < 50 = 20xx, Year ≥ 50 = 19xx
- **Rationale**: Maintains compatibility with existing data
- **Status**: ✓ Documented

---

## Text and Terminology Decisions

### String Extraction
- **Decision**: Extract all UI strings from Pascal source files
- **Source Files**: 
  - `H_SPR.PAS` (ConO, ConN, ConC, ConE, etc. arrays)
  - Other Pascal UI modules
- **Process**: Direct extraction without interpretation or enhancement
- **Status**: ✓ In Progress
- **Storage**: JSON resource files

### Terminology Preservation
- **Decision**: Use original German and English terms exactly as in source
- **Examples**:
  - "Beobachter" / "Observer"
  - "Hauptbeobachtungsort" / "primary observing site"
  - "keine Angabe" / "not observed"
- **Rationale**: Maintains consistency with existing documentation and user expectations
- **Status**: Active principle

---

## UI/Dialog Button Standards - Decision #018

- **Date**: 2026-01-10
- **Status**: ✓ Approved
- **Scope**: All modal dialogs, forms, and interactive elements

### Button Sizing & Layout

**Consistent Sizing for All Buttons**:
- All buttons must use: `btn-sm px-3`
- This applies to ALL dialogs without exception
- Settings dialogs previously had inconsistent sizing - now standardized

**Button Order (Left to Right)**:
1. Cancel/No button (if present)
2. OK/Yes button (rightmost, primary action)
3. Additional secondary buttons (Print, Save, etc.) go between Cancel and OK

**Example HTML**:
```html
<div class="modal-footer">
    <button class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">Abbrechen</button>
    <button class="btn btn-primary btn-sm px-3" id="btn-ok">OK</button>
</div>
```

### Button Text Standards

**Unified Terminology** (no distinction between "OK" and "Anwenden"):
- All action buttons use `common.ok` = "OK" (German) / "OK" (English)
- All cancel buttons use `common.cancel` = "Abbrechen" (German) / "Cancel" (English)

**Button Text Rules**:
1. ✓ Information dialogs (warnings, errors): **OK** button only
2. ✓ Confirmation dialogs: **Cancel** + **OK** buttons
3. ✓ Destructive action dialogs: **No** + **Yes** buttons (for delete/modify)
4. ✓ Filter/form dialogs: **Cancel** + **OK** buttons
5. ✗ NEVER use "Anwenden", "Apply", "Bestätigen", etc. - always use "OK"

**i18n Keys**:
- Use `i18nStrings.common.ok` / `i18n.common.ok`
- Use `i18nStrings.common.cancel` / `i18n.common.cancel`
- Use `i18nStrings.common.yes` / `i18n.common.yes` (only for Yes/No dialogs)
- Use `i18nStrings.common.no` / `i18n.common.no` (only for Yes/No dialogs)

### Button Colors

| Button Type | CSS Class | Usage | Default (Enter key) |
|------------|-----------|-------|-------------------|
| Cancel | `btn btn-secondary btn-sm px-3` | Close dialog without action | No |
| OK | `btn btn-primary btn-sm px-3` | Confirm/apply action | **Yes** |
| Yes (destructive) | `btn btn-danger btn-sm px-3` | Confirm delete/destructive action | **Yes** |
| No (destructive) | `btn btn-secondary btn-sm px-3` | Reject destructive action | No |
| Secondary action | `btn btn-secondary btn-sm px-3` | Print, Save, etc. (secondary to main action) | No |

### Implementation Rules

**For New Dialogs**:
1. ✓ Use template literal with `${this.i18n?.common?.ok || 'OK'}` for class-based components
2. ✓ Use `${i18nStrings.common.ok}` for function-based dialogs in main.js
3. ✓ Always include `btn-sm px-3` on EVERY button
4. ✓ Order buttons: Cancel (left) → OK (right)
5. ✓ Use `data-bs-dismiss="modal"` for Cancel button (closes without callback)

**For Existing Dialogs**:
- Filter dialog: Uses `this.i18n` with fallback to German
- Settings dialogs (Fixed Observer, Datum, Eingabeart, Ausgabeart): Now standardized
- Observation dialogs: All standardized
- Observer dialogs: All standardized
- Analysis/Output dialogs: All standardized
- Observer sites dialogs: All standardized

**Class-Based Component Pattern** (FilterDialog):
```javascript
createModalHTML() {
    // Inside template literal:
    <button class="btn btn-secondary btn-sm px-3">${this.i18n?.common?.cancel || 'Abbrechen'}</button>
    <button class="btn btn-primary btn-sm px-3">${this.i18n?.common?.ok || 'OK'}</button>
}
```

**Function-Based Pattern** (main.js dialogs):
```javascript
const modalHtml = `
    <button class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">${i18nStrings.common.cancel}</button>
    <button class="btn btn-primary btn-sm px-3" id="btn-action">${i18nStrings.common.ok}</button>
`;
```

### Related Files
- All JavaScript dialogs: `static/js/*.js`
- i18n strings: `resources/strings_*.json`
- Key functions: `showConfirmDialog()`, `showErrorDialog()`, `showWarningModal()`, `showSuccessModal()`

---

## Notification & Message Display Standards - Decision #019

- **Date**: 2026-01-10
- **Status**: ✓ Approved
- **Scope**: All temporary notifications (success, info, warning messages)

### Standard Notification Layout

**Location & Appearance**:
- Position: Fixed at top-center of screen (`position-fixed top-0 start-50 translate-middle-x`)
- Margin: 3px from top (`mt-3`)
- Z-index: 9999 (always above all other content)
- Minimum width: 300px
- Auto-dismiss: 3 seconds (configurable)
- Manual close: X button included

**Color Classes**:
| Type | Bootstrap Class | Usage |
|------|-----------------|-------|
| Success | `alert-success` (green) | Operation completed successfully |
| Info | `alert-info` (blue) | Informational messages |
| Warning | `alert-warning` (yellow) | Non-critical warnings |
| Danger | `alert-danger` (red) | Errors or critical warnings |

### Implementation

**Standard Function**:
```javascript
function showNotification(message, type = 'success', duration = 3000) {
    // Creates and displays a notification bar that auto-dismisses after duration
    // @param {string} message - HTML message to display (can include bold/icons)
    // @param {string} type - 'success', 'info', 'warning', or 'danger'
    // @param {number} duration - Auto-dismiss after ms (use 0 to disable)
}
```

**Usage Examples**:
```javascript
// Success message (3 second auto-dismiss)
showNotification('✓ 5 Beobachtungen geladen', 'success');

// Info message (5 second auto-dismiss)
showNotification('Datei wird verarbeitet...', 'info', 5000);

// Manual dismiss only (no auto-dismiss)
showNotification('⚠ Wichtiger Hinweis', 'warning', 0);
```

### Rules for New Notifications

**DO**:
1. ✓ Use `showNotification()` for all temporary messages
2. ✓ Include success symbol (✓) for success messages
3. ✓ Include warning symbol (⚠) for warnings
4. ✓ Use concise, user-friendly language
5. ✓ Specify duration if different from 3 seconds
6. ✓ Use i18n strings for multi-language support

**DON'T**:
1. ✗ Create custom alert/toast elements
2. ✗ Use modal dialogs for temporary messages
3. ✗ Use inline alerts in the page content
4. ✗ Hardcode CSS styling
5. ✗ Use different positioning or colors

### Current Usage
- File operations (save, load): Success notifications
- Data modifications (add, delete observations): Success notifications
- Errors: Danger notifications via `showErrorDialog()` (modal, not toast)

---

## i18n Structure Standards - Decision #020

- **Date**: 2026-01-18
- **Status**: ✓ Approved
- **Scope**: All internationalization strings in resources/strings_*.json

### Hierarchical Structure

All i18n strings follow a strict feature-based hierarchy to prevent confusion and ensure maintainability:

```
common.*          - Wiederverwendbare UI-Elemente (ok, cancel, yes, no, save, print, etc.)
menus.*           - NUR Menü-Items (Datei → Laden, Beobachtungen → Anzeigen, etc.)
observations.*    - ALLES rund um Beobachtungen (Dialoge, Formulare, Meldungen, Titel)
observers.*       - ALLES rund um Beobachter (Dialoge, Formulare, Meldungen, Titel)
analysis.*        - ALLES rund um Analysen
output.*          - ALLES rund um Ausgaben (Monatsstatistik, Jahresstatistik, etc.)
settings.*        - ALLES rund um Einstellungen
dialogs.*         - Generische Dialoge (no_data, confirm, error, etc.)
errors.*          - Fehlermeldungen (allgemein)
messages.*        - Informationsmeldungen (allgemein)
app.*             - Anwendungsmetadaten (version, title, etc.)
```

### Core Principle

**Feature-bezogene Texte gehören zur Feature-Kategorie, nicht zu menus/dialogs/buttons!**

### Examples

**✅ CORRECT**:
```json
"observations": {
  "display": "Anzeigen",                          // Menü-Text
  "display_title": "Beobachtungen anzeigen",      // Dialog-Titel
  "modify_type_title": "Beobachtungen ändern",    // Dialog-Titel
  "modify_single": "Einzelbeobachtungen",         // Dialog-Option
  "no_observations": "Keine Beobachtungen gefunden" // Feature-spezifische Meldung
}
```

**✗ WRONG**:
```json
"menus": {
  "observations": {
    "modify_type_title": "..."  // ✗ Gehört zu observations.*, nicht menus.*
  }
}

"dialogs": {
  "observations": {
    "modify_title": "..."       // ✗ Gehört zu observations.*, nicht dialogs.*
  }
}
```

### Rationale

- **Predictable**: Feature-Entwickler wissen sofort wo Strings liegen
- **Maintainable**: Alle Texte einer Feature-Gruppe an einem Ort
- **No Duplication**: Verhindert dass gleiche Texte an mehreren Stellen definiert werden
- **Fail Fast**: Missing keys sofort erkennbar (Decision #015)

### Implementation Rules

1. ✓ **ALWAYS** place feature-specific strings in the feature namespace
2. ✓ **ONLY** use `menus.*` for actual menu item text
3. ✓ **ONLY** use `common.*` for truly reusable UI elements
4. ✓ **NEVER** nest feature strings under `dialogs.*` or `buttons.*`
5. ✓ **ALWAYS** check existing structure before adding new keys

### Migration Note

Existing i18n files may contain legacy structure violations. When encountering incorrect placement:
1. Move strings to correct namespace
2. Update all JavaScript references
3. Test thoroughly before committing

---

## Dual-Language i18n Maintenance - Decision #021

- **Date**: 2026-01-18
- **Status**: ✓ Approved
- **Scope**: Changes to resources/strings_de.json and resources/strings_en.json

### Core Rule

Whenever the i18n resources are modified, both language files MUST be updated in lockstep — in exactly the same manner, in the same section, and at the same line position. The structure and key order must remain identical between DE and EN.

### Rationale
- **Consistency**: Prevents divergence that breaks Decision #015 (fail fast) and complicates maintenance
- **Predictability**: Ensures 1:1 mapping of keys for all features
- **Quality**: Avoids undefined keys and mismatched translations during development

### Implementation Rules
- ✓ Mirror every addition, deletion, or move in both files simultaneously
- ✓ Preserve identical hierarchy, key names, and ordering across DE and EN
- ✓ Maintain equal line counts after edits (structural alignment)
- ✓ When relocating strings (e.g., from `observers.*` to `observations.*`), apply the move to both files in the same section and line
- ✗ Do not introduce keys in only one language file
- ✗ Do not change ordering in one file without changing the other

### Workflow Guidance
- Use the existing `sync_i18n.py` helper to regenerate EN structure from DE when broad structural changes occur; immediately replace placeholders with real translations to comply with Decision #015 at runtime
- Before merging, verify alignment via quick checks (line counts and grep for moved/removed keys)

### Enforcement
- Code review/CI should reject PRs where DE/EN i18n structures or line counts diverge, or where edits are applied to only one language file

---

## Deferred Features

### Features NOT Yet Approved for Modification

1. **Statistics Module**: Original has statistical analysis
   - Status: To be evaluated
   - Decision pending: Python implementation approach

2. **Data Export Formats**: Beyond original .HAL/.BEO
   - Status: Not yet approved
   - CSV export was created for testing purposes only

### Decided Features

1. **Graphics Output**: 
   - **Decision**: ✓ Replace original DOS graphics with Python libraries
   - **Original**: DOS graphics output (BGI)
   - **New Approach**: Use modern Python visualization libraries
   - **Rationale**: DOS BGI not portable to web/modern platforms
   - **Status**: ✓ Approved

2. **Printing**: 
   - **Decision**: ✓ No specific printer drivers; rely on browser printing
   - **Original**: DOS printer control with specific drivers
   - **New Approach**: 
     - Preserve text output formats designed for printing
     - Use browser's native print functionality
   - **Rationale**: Modern browsers handle printing; no need for custom drivers
   - **Status**: ✓ Approved

---

## Technical Implementation Notes

## Original File Structure (Pascal)

```
HALOpy/
├── src/halo/           # Python package
├── data/               # CSV data files
├── resources/          # i18n JSON files
├── templates/          # HTML templates
├── static/             # CSS, JavaScript, images
├── temp/               # Test scripts (gitignored)
├── requirements.txt    # Python dependencies
├── halo.py             # Application entry point
└── README.md           # Documentation
```


### Backend Architecture (Python/Flask)

```
src/halo/
├── models/          # Data structures (equivalent to H_TYPES.PAS)
│   ├── types.py         - Observation, Observer, FilterMask
│   └── constants.py     - MaxKenn, MaxEE, Sektor set, etc.
├── services/        # Business logic (equivalent to H_ROUT.PAS, H_BEOBNG.PAS)
│   ├── observations.py  - CRUD operations, spaeter() sorting
│   ├── observers.py     - Observer management, multi-record handling
│   ├── analysis.py      - Statistics, frequency analysis
│   └── validation.py    - Field validation, dependencies, rules
├── io/              # File operations (equivalent to H_FILES.PAS)
│   ├── csv_handler.py   - CSV file I/O (if CSV format chosen)
│   └── binary_handler.py - Binary file I/O (if binary format chosen)
├── resources/       # Internationalization (equivalent to H_SPR.PAS)
│   ├── i18n.py          - I18n class with language switching
│   ├── strings_de.json  - German strings from ConO, ConN, ConE arrays
│   └── strings_en.json  - English strings from ConO, ConN, ConE arrays
├── api/             # REST API endpoints
│   └── routes.py        - /api/observations, /api/observers, /api/statistics
└── web/             # Flask application
    └── app.py           - Application factory, routes, session management
```

### Frontend Structure

```
templates/           # HTML templates (Jinja2)
├── header.html         - Unified header (file name & record count in menu bar)
├── footer.html         - Unified footer
├── index.html          - Main page with intro text
├── observations.html   - Browse/search/edit observations
├── observers.html      - Observer management
└── statistics.html     - Charts and analysis

static/
├── css/
│   └── style.css       - Responsive design, modal overlays
└── js/
    ├── main.js         - API calls, i18n switching, ESC key handling
    └── spinner.js      - Modal spinner with greyed background
```

### API Endpoints

#### File Operations
- `POST /api/file/open` - Read data file into memory (with unsaved changes warning)
- `POST /api/file/save` - Save observations from memory to disk
- `POST /api/file/new` - Create new empty file (with unsaved changes warning)
- `GET /api/file/status` - Get current file name and record count

#### Observations
- `GET /api/observations?limit=100&offset=0` - Paginated observations (sorted by spaeter())
- `POST /api/observations` - Create observation
- `PUT /api/observations/<id>` - Update observation
- `DELETE /api/observations/<id>` - Delete observation
- `POST /api/observations/delete` - Delete observation by matching key fields

#### Observers
- `GET /api/observers` - List observers with validity periods
- `GET /api/observers/<k>` - Get all records for observer K
- `POST /api/observers` - Create observer record
- `PUT /api/observers/<k>/<seit>` - Update observer record

#### Analysis
- `GET /api/statistics` - Database statistics
- `GET /api/analysis/frequency` - Frequency analysis

#### Internationalization
- `GET /api/i18n/<lang>` - Get language strings (de/en)
- `POST /api/i18n/switch` - Switch UI language

### Module Structure
```
src/halo/
  ├── io/          # Binary file I/O (equivalent to H_FILES.PAS)
  ├── models/      # Data structures (equivalent to H_TYPES.PAS)
  ├── services/    # Business logic (equivalent to H_ROUT.PAS, H_BEOBNG.PAS)
  ├── api/         # Web API routes
  ├── web/         # Web UI
  └── resources/   # i18n strings
```

### Encoding
- **Decision**: Handle DOS/ANSI special characters correctly
- **Original**: DOS codepage (CP437/CP850)
- **Target**: UTF-8 with proper conversion
- **Special Characters**: Degree symbol (°), German umlauts (ä,ö,ü,Ä,Ö,Ü,ß)
- **Status**: To be implemented

### Date/Time Handling
- **Decision**: Use CET timezone as in original
- **Reference**: Original specifies "CET (Central European Time)"
- **Status**: To be implemented

### Deployment Options

#### Local Development
```bash
cd c:\ASTRO\HALOpy
pip install -r requirements.txt
python halo.py
# Open http://localhost:5000
```

#### Local Network Server
- Same computer: http://localhost:5000
- Other devices on network: http://[local-ip]:5000
- Accessible from any device with web browser

#### Cloud Deployment Options (if needed)
- Heroku: Simple git-based deployment
- AWS Elastic Beanstalk: Scalable cloud hosting
- Google Cloud Run: Containerized deployment

**Note**: Deployment decision (Principle #2 - Open Question) will determine final hosting approach

### Release Management

**Critical**: Always create GitHub Releases for version updates to ensure the auto-update mechanism works correctly.

**Release Process**:
1. **Update version and date** in `resources/strings_de.json` and `resources/strings_en.json`:
   - Update `app.version` to new version (e.g., "3.0.7")
   - Update `app.version_date` to current date in format YYYY-MM-DD (e.g., "2026-01-30")
   - **CRITICAL**: Both files must be updated in lockstep (Decision #021)
2. Commit and push changes: `git add -A && git commit -m "vX.Y.Z - description" && git push`
3. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Create GitHub Release: `gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes"`

**Version String Requirements**:
- ✓ **ALWAYS** update both `app.version` and `app.version_date` before creating release
- ✓ Version format: "X.Y.Z" (without 'v' prefix in JSON files)
- ✓ Date format: "YYYY-MM-DD" (ISO 8601)
- ✓ Both language files must have identical version and date
- ✗ **NEVER** create release without updating version strings first
- **Rationale**: Auto-update mechanism relies on version comparison; outdated version strings prevent users from seeing update prompts

**Why releases are required**:
- The auto-update mechanism checks for tagged releases on GitHub
- Without releases, updates would download unstable `main` branch code
- Users rely on version numbers and release notes for update decisions
- Provides controlled, versioned distribution to end users

**See**: [AUTO_UPDATE.md](../docs/AUTO_UPDATE.md) for detailed release workflow and update mechanism documentation

## Running Application

**Server is currently running!**
- URL: http://localhost:5000
- Also available on network: http://192.168.178.179:5000
- Debug mode enabled for development
- Auto-reloads on code changes

Press Ctrl+C in terminal to stop server.

---

## Decision Log

This section tracks all architectural and implementation decisions in chronological order.

### December 2025

**2024-12-23**
- ✓ Created comprehensive data format documentation
- ✓ Documented all field types and dependencies from Pascal source
- ✓ Extracted exact ConO, ConN, ConC, ConE, Condd, ConH, ConF, ConV, Conff, ConG array values
- ✓ Documented Observer record structure
- ✓ Documented file sorting criteria for observations and observers
- ✓ Decision #001: Use standard file selector (implicit approval)
- ✓ Clarified sector notation: each visible octant explicitly listed with hyphens
- ✓ Clarified sector relevance: only for incomplete halos (V=1), not complete (V=2)
- ✓ Documented observer file structure: multiple records per observer with validity periods
- ✓ Decision #002: Graphics output - Replace DOS BGI with Python visualization libraries
- ✓ Decision #003: Printing - No custom printer drivers, use browser printing, preserve print-formatted text output
- ✓ Decision #004: Unified header and footer across all pages
- ✓ Decision #005: Main page shows intro text when returning from functions
- ✓ Decision #006: Display spinner for long-running operations
- ✓ Decision #007: ESC key interrupts and returns to main window
- ✓ Decision #008: File-based architecture with explicit read/save/create functions and data loss warnings
- ✓ Decision #009: NEW FEATURE - Display file name and record count in menu bar (not in original program)
- ✓ Decision #010: Session-based language management with server-side template rendering (2025-12-24)
- ✓ Decision #011: Server-side data storage and state management (2025-12-24)
- ✓ Decision #012: Do not use virtual environments (venv) for HALOpy (2025-12-25)
- ✓ Decision #013: All API endpoints must be verified before use in frontend code (2025-12-29)

---

## Open Questions

Items requiring decision/approval:

1. **Performance**: Acceptable performance thresholds for web vs. original DOS?
2. **Deployment**: Desktop app (Electron/similar) or pure web?
3. **File Storage Format**: Binary files (.HAL, .BEO with compression) vs. CSV as primary format?
4. **Statistics Module**: Implementation approach for statistical analysis features

---

## Change Request Template

For proposing new decisions:

```markdown
### Proposed Change: [Brief Description]
- **Current Behavior**: [How it works in original]
- **Proposed Behavior**: [What you want to change]
- **Rationale**: [Why this change is beneficial]
- **Impact**: [What will be affected]
- **Trade-offs**: [What we lose/gain]
- **Status**: Pending Approval
```

---

## Version History

- **v1.0** (2024-12-23): Initial documentation of project principles and decisions made to date
- **v1.1** (2025-12-23): Integrated web architecture details
- **v1.2** (2025-12-29): Added Decision #013 - API Endpoint Usage Policy principle
- **v1.3** (2026-01-04): Moved to .github/copilot-context.md for GitHub Copilot integration
