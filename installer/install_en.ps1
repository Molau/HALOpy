<#
.SYNOPSIS
    HALOpy Installation Script
.DESCRIPTION
    Automated installer for HALOpy - similar to the original HALO.EXE installer.
    Downloads Python, installs dependencies, and sets up HALOpy.
.NOTES
    Running as Administrator is optional; use it only if Python installation is blocked
    
.USAGE
    To run this unsigned script:
    Right-click install.ps1 -> "Run with PowerShell"
    OR
    Run install.bat (easiest)
#>

# Configuration
$PYTHON_VERSION = "3.11.7"
$PYTHON_BASE_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION"

# Detect system architecture
$IS_64BIT = [Environment]::Is64BitOperatingSystem
if ($IS_64BIT) {
    $PYTHON_INSTALLER_URL = "$PYTHON_BASE_URL/python-$PYTHON_VERSION-amd64.exe"
    $ARCHITECTURE = "64-bit"
} else {
    $PYTHON_INSTALLER_URL = "$PYTHON_BASE_URL/python-$PYTHON_VERSION.exe"
    $ARCHITECTURE = "32-bit"
}

$HALOPY_REPO_URL = "https://github.com/Molau/Halo/archive/refs/heads/main.zip"
$DEFAULT_INSTALL_DIR = "$env:USERPROFILE\HALOpy"

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-ColorOutput Green "==========================================================="
    Write-ColorOutput Green "  $Message"
    Write-ColorOutput Green "==========================================================="
    Write-Host ""
}

function Write-Step {
    param([string]$Message)
    Write-ColorOutput Cyan "[*] $Message"
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput Green "[OK] $Message"
}

function Write-Error-Message {
    param([string]$Message)
    Write-ColorOutput Red "[ERROR] $Message"
}

# Start installation
Clear-Host
Write-Header "HALOpy Installation"

Write-Host "This script will install HALOpy on your computer."
Write-Host ""

# Ask for installation directory
Write-ColorOutput Cyan "Where do you want to install HALOpy?"
Write-Host "Default: $DEFAULT_INSTALL_DIR"
$userInput = Read-Host "Press Enter for default or type a different path"

if ([string]::IsNullOrWhiteSpace($userInput)) {
    $INSTALL_DIR = $DEFAULT_INSTALL_DIR
} else {
    $INSTALL_DIR = $userInput
}

Write-Host ""
Write-Success "Installation directory: $INSTALL_DIR"
Write-Host ""
Write-Host "Press any key to continue or Ctrl+C to cancel..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Step 1: Check for Python
Write-Header "Step 1: Checking Python Installation"

$pythonInstalled = $false
$pythonPath = $null

# Check multiple ways to find Python
# Method 1: Try py launcher
try {
    $pyVersion = & py -3 --version 2>&1
    if ($pyVersion -match "Python 3") {
        $pythonInstalled = $true
        Write-Success "Python found via py launcher: $pyVersion"
    }
} catch {
    # py launcher not found, continue
}

# Method 2: Try python command
if (-not $pythonInstalled) {
    try {
        $pythonVersion = & python --version 2>&1
        if ($pythonVersion -match "Python 3") {
            $pythonInstalled = $true
            Write-Success "Python found via python command: $pythonVersion"
        }
    } catch {
        # python not found, continue
    }
}

# Method 3: Try python3 command
if (-not $pythonInstalled) {
    try {
        $pythonVersion = & python3 --version 2>&1
        if ($pythonVersion -match "Python 3") {
            $pythonInstalled = $true
            Write-Success "Python found via python3 command: $pythonVersion"
        }
    } catch {
        # python3 not found, continue
    }
}

# Method 4: Check default installation paths
if (-not $pythonInstalled) {
    $pythonPaths = @(
        "C:\Program Files\Python311\python.exe",
        "C:\Program Files\Python310\python.exe",
        "C:\Program Files (x86)\Python311\python.exe",
        "C:\Program Files (x86)\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
    )
    
    foreach ($path in $pythonPaths) {
        if (Test-Path $path) {
            try {
                $pythonVersion = & $path --version 2>&1
                if ($pythonVersion -match "Python 3") {
                    $pythonInstalled = $true
                    $pythonPath = $path
                    Write-Success "Python found at: $pythonPath ($pythonVersion)"
                    break
                }
            } catch {
                # Continue to next path
            }
        }
    }
}

# Install Python if not found
if (-not $pythonInstalled) {
    Write-Step "Python not found. Downloading Python $PYTHON_VERSION ($ARCHITECTURE)..."
    
    $tempInstaller = "$env:TEMP\python-installer.exe"
    
    try {
        Write-Host "  System architecture: $ARCHITECTURE"
        Write-Host "  Downloading from: $PYTHON_INSTALLER_URL"
        Invoke-WebRequest -Uri $PYTHON_INSTALLER_URL -OutFile $tempInstaller -UseBasicParsing
        Write-Success "Python installer downloaded to: $tempInstaller"
        
        Write-Step "Installing Python (this may take a few minutes)..."
        Write-Host "  Installation parameters: InstallAllUsers=1 PrependPath=1"
        
        # Use passive mode to show progress instead of silent
        $installArgs = "/passive InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1"
        $process = Start-Process -FilePath $tempInstaller -ArgumentList $installArgs -Wait -PassThru
        
        Write-Host "  Installation exit code: $($process.ExitCode)"
        
        if ($process.ExitCode -eq 0) {
            # Refresh PATH
            $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
            $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
            $env:Path = $machinePath + ";" + $userPath
            
            # Verify installation
            Write-Step "Verifying Python installation..."
            Start-Sleep -Seconds 2
            
            $verified = $false
            try {
                $pyVersion = & py -3 --version 2>&1
                if ($pyVersion -match "Python 3") {
                    $verified = $true
                    Write-Success "Python installed and verified: $pyVersion"
                }
            } catch {
                Write-ColorOutput Yellow "  py launcher not found, checking python command..."
                try {
                    $pythonVersion = & python --version 2>&1
                    if ($pythonVersion -match "Python 3") {
                        $verified = $true
                        Write-Success "Python installed and verified: $pythonVersion"
                    }
                } catch {
                    Write-ColorOutput Yellow "  python command not found yet"
                }
            }
            
            if (-not $verified) {
                Write-ColorOutput Yellow "Warning: Python may have installed but is not in PATH yet"
                Write-ColorOutput Yellow "You may need to restart your computer for PATH changes to take effect"
            }
        }
        else {
            Write-Error-Message "Python installation failed with exit code: $($process.ExitCode)"
            Write-Host "Common exit codes:"
            Write-Host "  1602/1603 - User cancelled or installation error"
            Write-Host "  1618 - Another installation is in progress"
            Write-Host ""
            Write-Host "You can try:"
            Write-Host "  1. Re-run as Administrator only if Python installation is blocked"
            Write-Host "  2. Download Python manually from: https://www.python.org/downloads/"
            Write-Host "  3. Make sure no other installations are running"
            Write-Host ""
            $continue = Read-Host "Continue without Python? (Y/N) [Y]"
            if ($continue -eq "N" -or $continue -eq "n") {
                exit 1
            }
        }
        
        # Clean up installer
        if (Test-Path $tempInstaller) {
            Remove-Item $tempInstaller -Force
        }
    }
    catch {
        Write-Error-Message "Failed to download or install Python: $_"
        Write-Host "Please download Python manually from: https://www.python.org/downloads/"
        Write-Host ""
        $continue = Read-Host "Continue without Python? (Y/N) [Y]"
        if ($continue -eq "N" -or $continue -eq "n") {
            exit 1
        }
    }
}

# Step 2: Download HALOpy
Write-Header "Step 2: Downloading HALOpy"

# Create installation directory if it doesn't exist
if (-not (Test-Path $INSTALL_DIR)) {
    Write-Step "Creating installation directory: $INSTALL_DIR"
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}

$zipPath = Join-Path $INSTALL_DIR "halopy.zip"
$extractPath = "$env:TEMP\halopy-extract"

Write-Step "Checking HALOpy package from GitHub..."
Write-Host "  Repository: https://github.com/Molau/Halo"

$remoteSize = $null
try {
    $headResponse = Invoke-WebRequest -Uri $HALOPY_REPO_URL -Method Head -UseBasicParsing
    $contentLength = $headResponse.Headers['Content-Length']
    if ($contentLength) {
        [void][int64]::TryParse($contentLength, [ref]$remoteSize)
        Write-Step "Remote ZIP size: $remoteSize bytes"
    }
} catch {
    Write-ColorOutput Yellow "Could not read remote ZIP size; will download fresh"
}

$useCachedZip = $false
if (Test-Path $zipPath) {
    $localSize = (Get-Item $zipPath).Length
    if ($remoteSize -and $localSize -eq $remoteSize) {
        Write-Success "Using cached HALOpy download (size matches remote)"
        $useCachedZip = $true
    }
    else {
        Write-Step "Cached ZIP differs or size unknown; downloading fresh..."
    }
}

if (-not $useCachedZip) {
    try {
        Invoke-WebRequest -Uri $HALOPY_REPO_URL -OutFile $zipPath -UseBasicParsing
        Write-Success "HALOpy downloaded"
    }
    catch {
        Write-Error-Message "Failed to download HALOpy: $_"
        Write-Host "You can manually download from: https://github.com/Molau/Halo/archive/refs/heads/main.zip"
        exit 1
    }
}

Write-Step "Extracting files..."

# Remove old extraction folder if exists
if (Test-Path $extractPath) {
    Remove-Item $extractPath -Recurse -Force
}

Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

# Move files from extracted folder to install directory
$extractedFolder = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1
Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $INSTALL_DIR -Recurse -Force

Write-Success "Files extracted to $INSTALL_DIR"

# Clean up extraction folder (keep ZIP for future runs)
Remove-Item $extractPath -Recurse -Force

# Step 3: Install Dependencies
Write-Header "Step 3: Installing Python Dependencies"

Set-Location $INSTALL_DIR

$pythonCommand = "python"
try {
    $testVersion = & python --version 2>&1
    if ($testVersion -notmatch "Python 3") { throw "not Python 3" }
} catch {
    $pythonCommand = "py"
    try {
        & py -3 --version 2>&1 | Out-Null
        $pythonCommand = "py"
    } catch {
        $pythonCommand = "python"
    }
}

if (Test-Path "requirements.txt") {
    Write-Step "Installing dependencies from requirements.txt..."
    
    try {
        & $pythonCommand -m pip install --upgrade pip 2>&1 | Out-Null
        & $pythonCommand -m pip cache purge 2>&1 | Out-Null
        
        if (-not $IS_64BIT) {
            Write-Step "32-bit Windows detected; preinstalling kiwisolver with 32-bit wheel..."
            & $pythonCommand -m pip install "kiwisolver==1.4.7"
        }
        
        & $pythonCommand -m pip install -r requirements.txt
        
        Write-Success "Dependencies installed successfully"
    }
    catch {
        Write-Error-Message "Failed to install dependencies: $_"
        Write-Host "You can install manually with: $pythonCommand -m pip install -r requirements.txt"
    }
}
else {
    Write-ColorOutput Yellow "Warning: requirements.txt not found"
}

# Step 4: Create Start Script
Write-Header "Step 4: Creating Start Script"

$batContent = @'
@echo off
REM HALOpy Launcher
REM Created by install.ps1

cd /d "%~dp0"

REM Detect Python command (python, py -3, python3)
where python >nul 2>&1 && (
    python --version 2>&1 | findstr /R "Python 3" >nul 2>&1 && (
        python halo.py
        goto :done
    )
)
where py >nul 2>&1 && (
    py -3 halo.py
    goto :done
)
where python3 >nul 2>&1 && (
    python3 halo.py
    goto :done
)

echo.
echo Error: Could not start HALOpy
echo Make sure Python 3 is installed and available in PATH
echo.
pause
goto :eof

:done
if errorlevel 1 (
    echo.
    echo Error: HALOpy exited with an error
    echo.
    pause
)
:eof
'@

$batPath = Join-Path $INSTALL_DIR "halo.bat"
Set-Content -Path $batPath -Value $batContent -Encoding ASCII

Write-Success "Start script created: halo.bat"

# Step 5: Create Desktop Shortcuts (optional)
Write-Header "Step 5: Creating Desktop Shortcuts"

$createShortcut = Read-Host "Create desktop shortcuts? (Y/N) [Y]"
if ($createShortcut -eq "" -or $createShortcut -eq "Y" -or $createShortcut -eq "y") {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $desktopPath = [Environment]::GetFolderPath("Desktop")
        
        # Shortcut: Start HALOpy (server + browser opens automatically)
        $serverShortcutPath = Join-Path $desktopPath "HALOpy.lnk"
        $serverShortcut = $WshShell.CreateShortcut($serverShortcutPath)
        $serverShortcut.TargetPath = $batPath
        $serverShortcut.WorkingDirectory = $INSTALL_DIR
        $serverShortcut.Description = "Start HALOpy"
        $serverShortcut.Save()
        
        Write-Success "Desktop shortcut created:"
        Write-Host "  - HALOpy.lnk (starts server and opens browser automatically)"
    }
    catch {
        Write-Error-Message "Could not create desktop shortcuts: $_"
    }
}

# Step 6: Create data directory
Write-Header "Step 6: Setting Up Data Directory"

$dataDir = Join-Path $INSTALL_DIR "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Success "Data directory created: $dataDir"
}
else {
    Write-Success "Data directory exists: $dataDir"
}

# Installation Complete
Write-Header "Installation Complete!"

Write-Host ""
Write-ColorOutput Green "HALOpy has been successfully installed!"
Write-Host ""
Write-Host "Installation directory: $INSTALL_DIR"
Write-Host ""
Write-ColorOutput Cyan "To start HALOpy:"
Write-Host "  1. Double-click on: $batPath"
Write-Host "  2. Or run from command prompt: cd `"$INSTALL_DIR`" ; .\halo.bat"
Write-Host "  The browser opens automatically."
Write-Host ""
Write-ColorOutput Yellow "First-time setup:"
Write-Host "  - Place your observation files (.HAL, .CSV) in: $dataDir"
Write-Host ""

$startNow = Read-Host "Start HALOpy now? (Y/N) [N]"
if ($startNow -eq "Y" -or $startNow -eq "y") {
    Write-Host ""
    Write-Step "Starting HALOpy..."
    Start-Process -FilePath $batPath -WorkingDirectory $INSTALL_DIR
    Write-Host "HALOpy is starting. The browser opens automatically."
}

Write-Host ""
Write-ColorOutput Green "Thank you for installing HALOpy!"
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
