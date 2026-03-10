# HALOpy - Program to Collect and Analyse HALO Observation

Python web application for maintenance of halo observations, modernized from the original Borland Pascal software (early 1990s).

## Architecture

### Backend (Python/Flask)
- `models/` - Data structures (Observation dataclass, constants, halo calculations)
- `services/` - Configuration persistence (settings.py)
- `io/` - CSV file handler and PostgreSQL database adapter
- `resources/` - i18n JSON strings (German/English), help files, observer metadata
- `api/` - REST API endpoints (observations, statistics, auto-updater)
- `web/` - Flask application, page routing

### Frontend (HTML/CSS/JavaScript)
- Responsive web interface (Bootstrap 5)
- Multi-language support (German/English)
- Works on desktop, tablet, and mobile

### MCP Integration
HALOpy provides **MCP-ready API endpoints** for generating statistics charts programmatically:
- Monthly statistics: `/api/monthly-stats?mm={month}&jj={year}&format={linegraph|bargraph}`
- Annual statistics: `/api/annual-stats?jj={year}&format={linegraph|bargraph}`

Returns PNG images ready for AI assistants, reporting tools, and automation. See [MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) for details.

### Data
- `data/` - Observation CSV files (.CSV format)
- `resources/` - Observer metadata (halobeo.csv)

## Operating Modes

### Local Mode
- CSV file-based storage in the `data/` folder
- No database or cloud account needed
- Start HALOpy and work directly

### Cloud Mode
- PostgreSQL database backend
- Password-protected access
- Deployed on AWS EC2 at [halopy.online](https://halopy.online)

## Data Import/Export

HALOpy uses **CSV format** for all observation data storage. This simplifies data handling and makes files human-readable.

### CSV Export Settings (from original HALO software)
When exporting observations from the original HALO application, use these settings:
- **Separator**: Comma (`,`)
- **Splitting**: Schlüsselelemente (key elements)

These settings ensure the CSV file has the correct 20+ field format that HALOpy expects.

### Migration from Binary Format
The original HALO software used compressed binary files (.HAL, .BEO). To migrate:
1. Export your data from the original HALO software using the CSV export function
2. Use the settings above to generate compatible CSV files
3. Import into HALOpy

## Installation

### Quick Install (Windows)

**Automated Installer** - Similar to the original HALO.EXE installer:

1. Download `install.bat` and `install_de.ps1` (or `install_en.ps1`) from the [installer](installer/) folder
2. Double-click `install.bat`
3. Follow the prompts (installs Python, dependencies, creates start script)
4. A desktop shortcut `HALOpy.lnk` is created (optional)
5. Double-click the shortcut or `halo.bat` — this starts the server and opens the browser automatically

See [installer/README.md](installer/README.md) for detailed installation instructions and troubleshooting.

### Manual Installation

#### Prerequisites

**Python Installation:**

- **Windows**: Python is NOT included with Windows. Download and install Python 3.10+ from [python.org](https://www.python.org/downloads/). During installation, check "Add Python to PATH". `pip` is included automatically.

- **Linux**: Usually pre-installed. If not: `sudo apt install python3 python3-pip` (Debian/Ubuntu) or equivalent for your distribution.

- **macOS**: Pre-installed on macOS 10.15+, but you may want to install a newer version via [Homebrew](https://brew.sh): `brew install python3`

**Verify Installation:**

*Windows (PowerShell/CMD):*
```powershell
python --version
pip --version
```

*Linux/macOS:*
```bash
python3 --version
pip3 --version
```

Both should show Python 3.10+ and pip version.

### Starting HALOpy

**Windows (PowerShell/CMD):**
```powershell
pip install -r requirements.txt
python halo.py
# Server starts and browser opens automatically at http://localhost:5000
```

**Linux/macOS:**
```bash
pip install -r requirements.txt
python halo.py
# Server starts and browser opens automatically at http://localhost:5000
```

## Requirements

- Python 3.10+ (both 32-bit and 64-bit supported)
- Modern web browser

### Python Dependencies (installed via `pip install -r requirements.txt`)

| Package | Purpose |
|---------|---------|
| Flask, Flask-CORS, Flask-WTF, Flask-Limiter | Web framework and middleware |
| python-dotenv | Environment configuration |
| matplotlib, numpy | Statistics charts and calculations |
| psycopg2-binary | PostgreSQL database (Cloud Mode) |
| boto3, bcrypt | AWS authentication (Cloud Mode) |
| uwsgi | Production server (Linux only) |

## License

MIT License - See [LICENSE](LICENSE) file for details.

Copyright (c) 1992-2026 Sirko Molau

Free to use, modify, and distribute. Attribution appreciated.

## Original Software

Original DOS software by Sirko Molau in 1992, translated to Python in 2025-2026.
