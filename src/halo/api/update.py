"""REST API endpoints for software updates.

Copyright (c) 1992-2026 Sirko Molau
Licensed under MIT License - see LICENSE file for details.
"""

# Standard library imports
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlopen

# Third-party imports
from flask import Blueprint, jsonify, request, current_app

update_blueprint = Blueprint('update', __name__, url_prefix='/api')


# ============================================================================
# Auto-Update Service
# ============================================================================

def _download_zip(url: str, dest_path: Path) -> None:
    with urlopen(url) as resp, open(dest_path, 'wb') as out:
        shutil.copyfileobj(resp, out)


def _copy_tree(src: Path, dst: Path, exclude: list[str]) -> None:
    for root, dirs, files in os.walk(src):
        rel_root = Path(root).relative_to(src)
        skip = False
        for ex in exclude:
            ex_path = Path(ex)
            if rel_root.parts[:len(ex_path.parts)] == ex_path.parts:
                skip = True
                break
        if skip:
            continue
        target_dir = dst / rel_root
        target_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            src_file = Path(root) / f
            rel_file = (rel_root / f).as_posix()
            if any(rel_file.startswith(ex) for ex in exclude):
                continue
            shutil.copy2(src_file, target_dir / f)


def update_from_github(repo: str, tag: str | None, root_path: Path) -> dict:
    """Download latest release or specified tag zip from GitHub and update files."""
    if not repo:
        return {"success": False, "error": "No repository configured"}
    zip_url = f"https://github.com/{repo}/archive/refs/tags/{tag}.zip" if tag else f"https://github.com/{repo}/archive/refs/heads/main.zip"
    try:
        tmpdir = tempfile.mkdtemp()
        tmpdir_path = Path(tmpdir)
        try:
            zip_path = tmpdir_path / "update.zip"
            _download_zip(zip_url, zip_path)
            extract_dir = tmpdir_path / "extract"
            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_dir)
            subdirs = [p for p in extract_dir.iterdir() if p.is_dir()]
            if not subdirs:
                return {"success": False, "error": "Invalid archive structure"}
            source_root = subdirs[0]
            exclude = ["data", "resources/halo.cfg"]
            _copy_tree(source_root, root_path, exclude)
        finally:
            try:
                shutil.rmtree(tmpdir, ignore_errors=True)
            except:
                pass
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def restart_server(root_path: Path) -> None:
    """Spawn a new server process and exit the current one."""
    try:
        halo_py = root_path / 'halo.py'
        python_exec = sys.executable
        shutil.which(python_exec)
        os.spawnl(os.P_NOWAIT, python_exec, python_exec, str(halo_py))
    except Exception:
        python_exec = sys.executable
        halo_py = root_path / 'halo.py'
        subprocess.Popen([python_exec, str(halo_py)])
    finally:
        os._exit(0)


@update_blueprint.route('/update', methods=['POST'])
def perform_update():
    data = request.get_json(silent=True) or {}
    repo = data.get('repo') or current_app.config.get('UPDATE_REPO', '')
    tag = data.get('tag')
    root_path = Path(__file__).parent.parent.parent.parent

    result = update_from_github(repo, tag, root_path)
    status = 200 if result.get('success') else 500
    return jsonify(result), status


@update_blueprint.route('/restart', methods=['POST'])
def restart():
    root_path = Path(__file__).parent.parent.parent.parent
    # Spawn new process and exit current
    restart_server(root_path)
    return jsonify({"success": True})
