# HALOpy - Program to Collect and Analyse HALO Observation

Python web application for maintenance of halo observations, modernized from the original Borland Pascal software (early 1990s).

## Architecture

### Backend (Python/Flask)
- `models/` - Data structures (Observation dataclass, constants, halo calculations)
- `services/` - Configuration persistence (settings.py)
- `io/` - CSV file handler (ObservationCSV class)
- `resources/` - i18n JSON strings (German/English), help files, observer metadata
- `api/` - REST API endpoints (routes.py with astronomy calculations, update.py with auto-updater)
- `web/` - Flask application

### Frontend (HTML/CSS/JavaScript)
- Responsive web interface
- Multi-language support (German/English)
- Works on desktop, tablet, and mobile
- Settings menu path for startup-file configuration: `Einstellungen -> feste Datei` (EN: `Settings -> Fixed File`)

### MCP Integration
HALOpy provides **MCP-ready API endpoints** for generating statistics charts programmatically:
- Monthly statistics: `/api/monthly-stats?mm={month}&jj={year}&format={linegraph|bargraph}`
- Annual statistics: `/api/annual-stats?jj={year}&format={linegraph|bargraph}`

Returns PNG images ready for AI assistants, reporting tools, and automation. See [MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md) for details.

### Data
- `data/` - Observation CSV files (.CSV format)
- `resources/` - Observer metadata (halobeo.csv)

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

1. Download `install.bat` and `install.ps1` from the [installer](installer/) folder
2. Double-click `install.bat`
3. Follow the prompts (installs Python, dependencies, creates start script)
4. Double-click `halo.bat` to start HALOpy

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

## Deployment Options

### Local Development

**Windows (PowerShell/CMD):**
```powershell
pip install -r requirements.txt
python halo.py
# Browser opens automatically at http://localhost:5000
```

**Linux/macOS:**
```bash
pip install -r requirements.txt
python halo.py
# Browser opens automatically at http://localhost:5000
```

### Local Server
Run on a machine in your home/lab network, accessible from other devices.

### Cloud Deployment
Deploy to:
- Heroku
- AWS Elastic Beanstalk
- Google Cloud Run
- DigitalOcean App Platform

## Requirements

- Python 3.10+ (both 32-bit and 64-bit supported)
- Flask web framework (3.0+)
- NumPy (1.24+)
- Matplotlib (3.7+)
- Modern web browser

**Note**: HALOpy has minimal dependencies (3 packages) for easy installation on any system.

## License

MIT License - See [LICENSE](LICENSE) file for details.

Copyright (c) 1992-2026 Sirko Molau

Free to use, modify, and distribute. Attribution appreciated.

## Original Software

Original DOS software by Sirko Molau in 1992, translated to Python in 2025-2026.
