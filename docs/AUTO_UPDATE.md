# HALOpy Auto-Update Feature

## Overview

HALOpy includes an auto-update mechanism that checks for new releases on GitHub and allows users to download and install updates with a single click.

**Important**: Always create a GitHub Release for each version. The update mechanism relies on tagged releases to provide controlled, versioned updates to users.

## How It Works

1. **On Startup**: The application checks GitHub for the latest release
2. **Version Comparison**: Compares current version with latest available version
3. **User Prompt**: If a newer version exists, prompts user to update
4. **Download & Extract**: Downloads release ZIP from GitHub
5. **File Replacement**: Copies updated files (excludes data and config)
6. **Restart**: Automatically restarts the application with new code

## Configuration

### Enable Auto-Update

Edit `src/halo/web/app.py` and set the `UPDATE_REPO` configuration:

```python
app.config.update({
    # ...
    'UPDATE_REPO': 'owner/HALOpy',  # Replace with your GitHub repository
})
```

**Example**:
```python
'UPDATE_REPO': 'astro-community/HALOpy',
```

### Disable Auto-Update

Leave `UPDATE_REPO` empty (default):

```python
'UPDATE_REPO': '',  # Disabled
```

## Requirements

- GitHub repository with releases (tagged versions)
- Internet connection for update checks
- Write permissions to application directory

## What Gets Updated

**Updated files**:
- Python source code (`src/halo/`)
- Templates (`templates/`)
- Static files (`static/`)
- Documentation (`docs/`)
- Configuration templates

**Preserved files** (NOT overwritten):
- User data (`data/` directory)
- User configuration (`resources/halo.cfg`)
- Observer database (`resources/halobeo.csv`)

## Version Numbering

The update system uses semantic versioning (e.g., `3.0.0`):
- GitHub releases **must** be tagged as `v3.0.0` (with 'v' prefix)
- Version in `resources/strings_de.json` and `strings_en.json` under `app.version` (without 'v' prefix)

**Example tag structure**:
```
v3.0.0
v3.0.1
v3.1.0
```

**Why tags are required**:
- Without tagged releases, the update mechanism would always download the latest `main` branch
- Users would have no version control or release notes
- Updates could not be targeted to specific stable versions

## Creating Releases

**Always create a GitHub Release for each version!** This ensures the auto-update mechanism works correctly.

### Step-by-Step Release Process

1. **Update version number** in `resources/strings_de.json` and `strings_en.json`:
   ```json
   "app": {
     "version": "3.1.0",
     "version_date": "2026-01-15"
   }
   ```

2. **Commit and push changes**:
   ```bash
   git add -A
   git commit -m "v3.1.0 - Brief description of changes"
   git push
   ```

3. **Create and push Git tag**:
   ```bash
   git tag v3.1.0
   git push origin v3.1.0
   ```

4. **Create GitHub Release** (using GitHub CLI):
   ```bash
   gh release create v3.1.0 --title "v3.1.0" --notes "**Release Notes**
   
   - Feature: Description of new feature
   - Fixed: Bug fix description
   - Improved: Enhancement description"
   ```

   **Or manually** via GitHub web interface:
   - Go to https://github.com/YOUR_USERNAME/HALOpy/releases/new
   - Select tag: `v3.1.0`
   - Release title: `v3.1.0`
   - Add release notes describing changes
   - Click "Publish release"

5. **Verify** the release is visible at `https://github.com/YOUR_USERNAME/HALOpy/releases`

### Release Notes Template

```markdown
**Bug Fix Release** / **Feature Release** / **Maintenance Release**

- Fixed: Description of bug fix
- Added: Description of new feature
- Improved: Description of enhancement
- Changed: Description of breaking change
- Removed: Description of removed feature
```

## User Experience

When an update is available:

1. **Prompt appears** on startup:
   - DE: "Eine neue Version ist verfügbar: 3.1.0 (aktuell: 3.0.0). Möchten Sie die neue Version herunterladen und installieren?"
   - EN: "A new version is available: 3.1.0 (current: 3.0.0). Do you want to download and install it?"

2. **User clicks OK**:
   - Progress modal: "Aktualisierung wird heruntergeladen..." / "Downloading update..."
   - Files are replaced automatically
   - Application restarts

3. **User clicks Cancel**:
   - Continue with current version
   - Check again on next startup

## Troubleshooting

**Update check fails silently**:
- Check internet connection
- Verify repository name in `UPDATE_REPO`
- Check GitHub API rate limits

**Download fails**:
- Ensure GitHub release exists with proper tag
- Check file permissions in application directory
- Verify sufficient disk space

**Application doesn't restart**:
- Manually restart using `python halo.py`
- Check console for error messages

## Security Considerations

- Updates download from GitHub's official servers only
- No third-party servers involved
- User must explicitly confirm update
- User data and configuration preserved
- Original files overwritten (no backup created automatically)

## Development Mode

During development, set `UPDATE_REPO` to empty string to disable update checks.

## Technical Details

**Backend**:
- `src/halo/services/updater.py`: Update download and extraction logic
- `src/halo/api/update.py`: REST API endpoints (`/api/update`, `/api/restart`)

**Frontend**:
- `static/js/main.js`: `checkForUpdates()` function
- Checks GitHub API: `https://api.github.com/repos/{owner}/{repo}/releases/latest`
- Downloads ZIP: `https://github.com/{owner}/{repo}/archive/refs/tags/{tag}.zip`

**i18n**:
- `resources/strings_de.json` and `strings_en.json`: Update dialog texts

---

*Last updated: 2026-01-29*
*See also: [Architecture Guidelines](../.github/copilot-context.md) for project-wide development guidelines*
