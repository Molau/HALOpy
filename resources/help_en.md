# HALO Documentation (Version 3.1)

## 1. About the Program

HALOpy is a web application for recording, displaying, and analyzing halo observations in the standardized HALO key format. Operation is comfortable in the browser, while the proven functions of the original DOS program are retained. Observations can be recorded, saved, and presented as monthly reports and in a variety of statistical analyses. With loaded data, you can create complete monthly and annual statistics as well as investigations covering larger data sets.

Due to its various configuration options, the program can easily be adapted to the specific requirements of the individual user and is also suitable as a central recording program for reporting stations. It strictly adheres to the encryption specifications used in the Halo Observation Section since January 1978 in their current form.

The program HALOpy is open-source software that is regularly updated and improved. The source code is freely available on GitHub and can be downloaded at any time at no cost. The copyrights mentioned under section 6 must be observed.

At this point, we thank those who developed the halo key and thus created the prerequisites for digital recording and the analyses that are now possible.

As of version 3.1, HALOpy supports two operating modes:

  * **Local Mode**: The program works file-based with CSV files in the local file system, as before. All File menu functions are available. The application is started locally with `python halo.py` and is then accessible in the browser at http://localhost:5000.
  * **Cloud Mode**: The program works database-based as a multi-user system. Access is via https://halopy.online. Login (username and password) is required at startup. Each user has write access only to their own observations and observer data; administrators can edit all data. The file operations in the 'File' menu are not available, as data management is handled entirely through the database.

In both modes, upload and download of observations and observer data are available (see 4.3 and 4.4).

## 2. Installation of the Program

### 2.1 Hardware Requirements

HALOpy runs as a web application in a current desktop browser (Firefox, Chrome, Edge, Safari) with active JavaScript. The server component requires Python 3.x with the dependencies listed in requirements.txt. Display is via the browser and output is generated with the browser's print function.

### 2.2 Installation

**Prerequisites: Python Installation**

* **Windows**: Python is NOT included with Windows. Download Python 3.10+ from [python.org](https://www.python.org/downloads/) and install it. During installation, check "Add Python to PATH". `pip` is included automatically.
* **Linux**: Usually pre-installed. If not: `sudo apt install python3 python3-pip` (Debian/Ubuntu) or equivalent for your distribution.
* **macOS**: Pre-installed on macOS 10.15+, but you may want to install a newer version via [Homebrew](https://brew.sh): `brew install python3`

**HALOpy Installation and Startup:**

*Windows (PowerShell/CMD):*
```powershell
pip install -r requirements.txt
python halo.py
```

*Linux/macOS:*
```bash
pip3 install -r requirements.txt
python3 halo.py
```

Then open HALOpy in your browser at http://localhost:5000. The data and resource files are in the project (e.g., data/, resources/), no special drivers or installers are required.

## 3. Program Structure

### 3.1 File Names

Program files and resources are in the project directory (e.g., templates/, static/, resources/). Observation files are managed as CSV in the data/ directory and can be freely named (standard: .csv extension). Legacy .HAL files must be exported to CSV in advance using the DOS version of the program. Storage in the standardized HALO key format remains unchanged. Exports for further processing (e.g., spreadsheets) are created as CSV.

### 3.2 Using the Menus

Operation is via the browser through the navigation bar and buttons. Colors and layout follow the web UI design (Bootstrap-like); there are no color-coded DOS windows anymore.
Standard operations:

  * Navigation via mouse/touch on buttons and links; keyboard operation via Tab/Enter is possible.
  * ESC closes dialogs or returns to the main page (as intended in the original).

Dialogs (e.g., warnings, load/save) appear as modal overlays with a darkened background. In input masks, keyboard focus is set automatically; required fields are marked.

### 3.3 Program Start

**Local Mode:** Start the server:
* Windows: `python halo.py`
* Linux/macOS: `python3 halo.py`

After startup, open HALOpy in your browser (default: http://localhost:5000).

Depending on the configuration, a defined observation file may be loaded automatically on startup; otherwise, select the file (CSV) via the web interface and work with it in server memory. Crash recovery is active: if a recovery file with the extension `$$$` was created during a session, HALOpy will offer to use it on the next startup to avoid losing changes. Unsaved changes are additionally queried when switching files or exiting.

**Cloud Mode:** Open https://halopy.online in your browser. The login page appears first. After successful authentication with username and password, the main workspace is loaded directly. Observation and observer data are retrieved from the database. A logout button in the navigation bar allows ending the session.

There is no separate exit menu in the web version. In local mode, end your session by closing the browser tab; if there are unsaved changes, you will be warned. In cloud mode, use the logout button.

## 4. The Functions of Individual Program Items

### 4.1 The Version Menu '≡'

The version menu in the header shows build information and the change summary of the current HALOpy version.

  * 'Version': Shows program and build information of the running instance.
  * 'What's New': Opens the stored change summary (whats_new_de/whats_new_en) for the current version.

### 4.2 The File Menu

**Local Mode:** The File menu controls loading, saving, and exporting of observation files (CSV) in the browser. All operations work on server storage; changes are written back to the file when saved.

  * 'New File': Creates an empty observation file in HALO key format (CSV) and loads it immediately for editing.
  * 'Open': Selects and loads an existing CSV file; after loading, the file name and number of observations are displayed.
  * 'Select': Filters the loaded file according to criteria (e.g., date, month, observer, halo type) and creates a new file from the matches or from the remaining records.
  * 'Concatenate': Merges the currently loaded file with another observation file and removes duplicate entries; the data remains sorted.
  * 'Save': Writes the currently loaded file from server storage back. If there are unsaved changes, you will be warned before loading other files or exiting.
  * 'Save As': Saves the loaded file under a new name and continues working with the new file (copy).

Legacy .HAL files must be exported to CSV in the original DOS version; then they can be loaded, selected, or merged. Direct HAL conversion in the browser is not provided.

Directory switching is not needed in the browser; file selection is done via the operating system's file dialog.

**Cloud Mode:** In cloud mode, the file-related functions (New File, Open, Select, Concatenate, Save, Save As) are not available, as data management is handled entirely through the database. Upload and Download remain available (see below). 

**Both Modes:** The following functions are available in both operating modes:

  * 'Upload Observations': Uploads observations in CSV format to the server. In local mode, prior authentication is required. The user can choose whether existing observations should be replaced or supplemented.
  * 'Download Observations': Downloads observations in CSV format from the server. In local mode, prior authentication is required. The user can choose whether to download only their own or all observations.

### 4.3 The Observations Menu

This menu bundles the display, entry, modification, and deletion of observations from the loaded file.

  * 'Display': Shows observations filtered by criteria (e.g., year/month/day, time, observer, region, halo type). Output occurs in the browser; if no matches are found, a warning appears.
  * 'Add': Opens the input mask according to the HALO key. Entries are immediately checked against the validation rules; invalid combinations are rejected. Fixed values (e.g., fixed observer/date) are adopted, required fields are marked.
  * 'Change': Searches for observations according to criteria and allows modification of individual fields. Changes are validated immediately; sorting is retained after saving.
  * 'Delete': Searches for observations according to criteria and removes selected entries from the loaded file.
  * Menu entries: Guided forms with selection fields; suitable when the observation is not yet coded.
  * Numeric entries: Key entry as a numeric column according to the HALO key; faster for already coded observations.

All changes affect server storage and make the file "unsaved". You will be warned before switching files or exiting. ESC closes dialogs without applying changes.

### 4.4 The Observer Menu

Here you manage observer data (ID number, name, observation sites with validity, active status). Changes are saved immediately.

  * 'Display': Opens the observer list (current records). Filtering by ID/name, site, or area is possible.
  * 'Add': Creates a new observer with ID, name, primary/secondary observation site (including coordinates/area) and start of validity; active status is set.
  * 'Change': Modifies master fields (ID, name) or location-related entries with validity/coordinates/activity; existing location entries can be supplemented or deleted (at least one remains).
  * 'Delete': Removes an observer including all location entries after a safety query, permanently.
  * 'Upload': Uploads observer data in CSV format to the server. In local mode, prior authentication is required.
  * 'Download': Downloads observer data in CSV format from the server. In local mode, prior authentication is required.

### 4.5 The Analysis Menu

In the web interface, you access analyses via the "Analysis" page. Numerical and graphical outputs are available; results can be saved as CSV/TXT or (depending on the view) as PNG.

Parameter selection and options (corresponding to original behavior):

  * Free parameters: 1D or 2D over key groups (e.g., month, halo type, cirrus genus) or sun altitude (min/average/max; Germany data only).
  * Time reference: Time can be adjusted to local time.
  * Duration: Option whether entries without start/end (kA/kE) are included.
  * Halo type subdivision: Option to split complete forms into individual components (e.g., left/right parhelion).
  * Cloud genera: Option for subdivision analogous to original software.
  * Value calculation: Absolute values, percentage values; for 2D additionally normalization per X or per Y.

Output:

  * Numerical: Table view in browser, optionally as HTML table, as pseudographics (as in the DOS original), or in Markdown format; for large tables, navigation via scrolling.
  * Graphical: Line or bar chart, optional PNG export.
  * Save: Results can be saved depending on the view as CSV (HTML table), TXT (pseudographics), or MD (Markdown); graphics as PNG.

### 4.6 The Output Menu

The menu leads to three output pages: Monthly report, monthly statistics, and annual statistics. A loaded observation file is required; otherwise, a warning message appears. The result display is in the browser.

Text output formats: HTML table (web layout), pseudographics (DOS layout), or Markdown. The selected format applies to all three outputs. Saving is format-dependent: CSV for HTML tables, TXT for pseudographics, MD for Markdown. Printing is via the browser's print function; pseudographics and Markdown views are rendered accordingly for printing.

  * 'Monthly Report': Filter dialog for observer (fixed observer is preselected, otherwise selectable) and month/year (default according to date setting). Output in selected text format; save and print directly from the view.
  * 'Monthly Statistics': Select month/year, output in selected text format with activity table; additionally, an activity diagram can be displayed (view in browser, printable). Saving creates CSV/TXT/MD according to format.
  * 'Annual Statistics': Select year, output in selected text format (overviews and activity). An activity diagram can be displayed; saving creates CSV/TXT/MD according to format.

### 4.7 The Settings Menu

This menu provides the current settings. All changes are saved immediately and take effect in the browser (no printer or color options needed anymore).

  * 'Fixed Observer' (local mode only): Default observer setting for input and output masks (e.g., monthly report).
  * 'Active Observers': Lists and analyses optionally limited to active observers or showing all.
  * 'Fixed File' (local mode only): Optionally load a specific CSV file automatically at program startup.
  * 'Date': Choose default for date prompts: none, current month, previous month, or constant month (with month/year selection).
  * 'Input Mode': Preset menu entries (guided forms) or numeric entries (key line) for observation dialogs.
  * 'Output Mode': Choose text format for monthly report/statistics, annual statistics, and analysis: HTML tables, pseudographics, or Markdown (CSV/TXT/MD accordingly).
  * 'Change Password' (cloud mode only): Allows the logged-in user to change their password.

### 4.8 The Help Menu

The Help menu displays this help text directly in the browser; navigation is via scrolling or internal links. The language follows the current session setting.

### 4.9 'Logout' (cloud mode only)

In cloud mode, a 'Logout' button is available in the navigation bar. It ends the current session and returns to the login page.

### 4.10 Photo Gallery (cloud mode only)

In cloud mode, photos can be uploaded and managed for each observation. The thumbnail bar appears in the entry dialog as soon as photos are available.

  * 'Upload Photos': Use the button in the dialog footer to upload one or more image files (JPEG, PNG, WEBP). Only a limited number of photos per observation is supported. The upload button becomes available as soon as observer, year, month, and day are known.
  * Caption: Optionally, a short multiline caption can be entered for the uploaded photos and edited later.
  * Photo viewer: Clicking a thumbnail opens the integrated image viewer. Use the arrow buttons to navigate between photos, or download or delete an individual photo.
  * Deletion: When deleting an observation, if photos exist, you are asked whether the photo album should also be removed. If the observation is the last one by an observer on that day, the photos are deleted automatically.

**Usage rights:** By uploading a photo, the author grants the AKM and its members the right to use the photo with attribution for association-conform purposes – for example in monthly reports or other publications of the AKM.

## 5. Notes

HALOpy is comprehensive; please report any found bugs with a brief description (when, where, what action) and, if possible, with the file used. Feedback and improvement suggestions are welcome; feasible ideas are incorporated into new versions after review.

Contact: Sirko Molau, Abenstalstr. 13b, D-84072 Seysdorf, E-Mail: sirko@molau.de

## 6. Copyrights

HALOpy uses Python, HTML/JS/CSS and runs in the browser; see LICENSE for current license terms.
