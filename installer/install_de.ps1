<#
.SYNOPSIS
    HALOpy Installationsskript
.DESCRIPTION
    Automatisiertes Installationsprogramm fuer HALOpy - aehnlich dem urspruenglichen HALO.EXE Installer.
    Laeuft Python herunter, installiert Abhaengigkeiten und richtet HALOpy ein.
.NOTES
    Die Ausfuehrung als Administrator ist optional; verwenden Sie es nur, wenn die Python-Installation blockiert wird
    
.USAGE
    So fuehren Sie dieses unsignierte Skript aus:
    Klicken Sie mit der rechten Maustaste auf install_de.ps1 -> "Mit PowerShell ausfuehren"
    ODER
    Fuehren Sie install_de.bat aus (am einfachsten)
#>

# Konfiguration
$PYTHON_VERSION = "3.11.7"
$PYTHON_BASE_URL = "https://www.python.org/ftp/python/$PYTHON_VERSION"

# Systemarchitektur erkennen
$IS_64BIT = [Environment]::Is64BitOperatingSystem
if ($IS_64BIT) {
    $PYTHON_INSTALLER_URL = "$PYTHON_BASE_URL/python-$PYTHON_VERSION-amd64.exe"
    $ARCHITECTURE = "64-Bit"
} else {
    $PYTHON_INSTALLER_URL = "$PYTHON_BASE_URL/python-$PYTHON_VERSION.exe"
    $ARCHITECTURE = "32-Bit"
}

$HALOPY_REPO_URL = "https://github.com/Molau/Halo/archive/refs/heads/main.zip"
$DEFAULT_INSTALL_DIR = "$env:USERPROFILE\HALOpy"

# Farben fuer Ausgabe
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
    Write-ColorOutput Red "[FEHLER] $Message"
}

# Installation starten
Clear-Host
Write-Header "HALOpy Installation"

Write-Host "Dieses Skript wird HALOpy auf Ihrem Computer installieren."
Write-Host ""

# Nach Installationsverzeichnis fragen
Write-ColorOutput Cyan "Wo moechten Sie HALOpy installieren?"
Write-Host "Standard: $DEFAULT_INSTALL_DIR"
$userInput = Read-Host "Druecken Sie die Eingabetaste fuer Standard oder geben Sie einen anderen Pfad ein"

if ([string]::IsNullOrWhiteSpace($userInput)) {
    $INSTALL_DIR = $DEFAULT_INSTALL_DIR
} else {
    $INSTALL_DIR = $userInput
}

Write-Host ""
Write-Success "Installationsverzeichnis: $INSTALL_DIR"
Write-Host ""
Write-Host "Druecken Sie eine beliebige Taste zum Fortfahren oder Strg+C zum Abbrechen..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Schritt 1: Python-Installation ueberpruefen
Write-Header "Schritt 1: Python-Installation ueberpruefen"

$pythonInstalled = $false
$pythonPath = $null

# Mehrere Wege, um Python zu finden
# Methode 1: Versuchen Sie den py Launcher
try {
    $pyVersion = & py -3 --version 2>&1
    if ($pyVersion -match "Python 3") {
        $pythonInstalled = $true
        Write-Success "Python gefunden via py Launcher: $pyVersion"
    }
} catch {
    # py Launcher nicht gefunden, fortfahren
}

# Methode 2: Versuchen Sie den python Befehl
if (-not $pythonInstalled) {
    try {
        $pythonVersion = & python --version 2>&1
        if ($pythonVersion -match "Python 3") {
            $pythonInstalled = $true
            Write-Success "Python gefunden via python Befehl: $pythonVersion"
        }
    } catch {
        # python nicht gefunden, fortfahren
    }
}

# Methode 3: Versuchen Sie den python3 Befehl
if (-not $pythonInstalled) {
    try {
        $pythonVersion = & python3 --version 2>&1
        if ($pythonVersion -match "Python 3") {
            $pythonInstalled = $true
            Write-Success "Python gefunden via python3 Befehl: $pythonVersion"
        }
    } catch {
        # python3 nicht gefunden, fortfahren
    }
}

# Methode 4: Ueberpruefen Sie Standard-Installationspfade
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
                    Write-Success "Python gefunden bei: $pythonPath ($pythonVersion)"
                    break
                }
            } catch {
                # Zum naechsten Pfad fortfahren
            }
        }
    }
}

# Python installieren, falls nicht gefunden
if (-not $pythonInstalled) {
    Write-Step "Python nicht gefunden. Laden Sie Python $PYTHON_VERSION ($ARCHITECTURE) herunter..."
    
    $tempInstaller = "$env:TEMP\python-installer.exe"
    
    try {
        Write-Host "  Systemarchitektur: $ARCHITECTURE"
        Write-Host "  Download von: $PYTHON_INSTALLER_URL"
        Invoke-WebRequest -Uri $PYTHON_INSTALLER_URL -OutFile $tempInstaller -UseBasicParsing
        Write-Success "Python Installer heruntergeladen zu: $tempInstaller"
        
        Write-Step "Installieren von Python (dies kann einige Minuten dauern)..."
        Write-Host "  Installationsparameter: InstallAllUsers=1 PrependPath=1"
        
        # Verwenden Sie den passiven Modus, um den Fortschritt anzuzeigen, anstatt stille Installation
        $installArgs = "/passive InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1"
        $process = Start-Process -FilePath $tempInstaller -ArgumentList $installArgs -Wait -PassThru
        
        Write-Host "  Installations-Exit-Code: $($process.ExitCode)"
        
        if ($process.ExitCode -eq 0) {
            # PATH aktualisieren
            $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
            $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
            $env:Path = $machinePath + ";" + $userPath
            
            # Installation ueberpruefen
            Write-Step "Ueberpruefen der Python-Installation..."
            Start-Sleep -Seconds 2
            
            $verified = $false
            try {
                $pyVersion = & py -3 --version 2>&1
                if ($pyVersion -match "Python 3") {
                    $verified = $true
                    Write-Success "Python installiert und ueberprueft: $pyVersion"
                }
            } catch {
                Write-ColorOutput Yellow "  py Launcher nicht gefunden, ueberpruefung des python Befehls..."
                try {
                    $pythonVersion = & python --version 2>&1
                    if ($pythonVersion -match "Python 3") {
                        $verified = $true
                        Write-Success "Python installiert und ueberprueft: $pythonVersion"
                    }
                } catch {
                    Write-ColorOutput Yellow "  python Befehl noch nicht gefunden"
                }
            }
            
            if (-not $verified) {
                Write-ColorOutput Yellow "Warnung: Python kann installiert sein, ist aber noch nicht in PATH"
                Write-ColorOutput Yellow "Moeglichweise muessen Sie Ihren Computer neu starten, damit die PATH-Aenderungen wirksam werden"
            }
        }
        else {
            Write-Error-Message "Python-Installation fehlgeschlagen mit Exit-Code: $($process.ExitCode)"
            Write-Host "Haeufige Exit-Codes:"
            Write-Host "  1602/1603 - Benutzer abgebrochen oder Installationsfehler"
            Write-Host "  1618 - Eine andere Installation wird durchgefuehrt"
            Write-Host ""
            Write-Host "Sie koennen versuchen:"
            Write-Host "  1. Nur als Administrator neu starten, wenn die Python-Installation blockiert wird"
            Write-Host "  2. Python manuell herunterladen von: https://www.python.org/downloads/"
            Write-Host "  3. Stellen Sie sicher, dass keine anderen Installationen ausgefuehrt werden"
            Write-Host ""
            $continue = Read-Host "Ohne Python fortfahren? (J/N) [J]"
            if ($continue -eq "N" -or $continue -eq "n") {
                exit 1
            }
        }
        
        # Installer aufraaeumen
        if (Test-Path $tempInstaller) {
            Remove-Item $tempInstaller -Force
        }
    }
    catch {
        Write-Error-Message "Fehler beim Herunterladen oder Installieren von Python: $_"
        Write-Host "Bitte laden Sie Python manuell herunter von: https://www.python.org/downloads/"
        Write-Host ""
        $continue = Read-Host "Ohne Python fortfahren? (J/N) [J]"
        if ($continue -eq "N" -or $continue -eq "n") {
            exit 1
        }
    }
}

# Schritt 2: HALOpy herunterladen
Write-Header "Schritt 2: HALOpy herunterladen"

# Installationsverzeichnis erstellen, falls noch nicht vorhanden
if (-not (Test-Path $INSTALL_DIR)) {
    Write-Step "Installationsverzeichnis erstellen: $INSTALL_DIR"
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}

$zipPath = Join-Path $INSTALL_DIR "halopy.zip"
$extractPath = "$env:TEMP\halopy-extract"

Write-Step "HALOpy Paket von GitHub ueberpruefen..."
Write-Host "  Repository: https://github.com/Molau/Halo"

$remoteSize = $null
try {
    $headResponse = Invoke-WebRequest -Uri $HALOPY_REPO_URL -Method Head -UseBasicParsing
    $contentLength = $headResponse.Headers['Content-Length']
    if ($contentLength) {
        [void][int64]::TryParse($contentLength, [ref]$remoteSize)
        Write-Step "Remote ZIP Groesse: $remoteSize Bytes"
    }
} catch {
    Write-ColorOutput Yellow "Konnte Remote-ZIP-Groesse nicht lesen; wird neu heruntergeladen"
}

$useCachedZip = $false
if (Test-Path $zipPath) {
    $localSize = (Get-Item $zipPath).Length
    if ($remoteSize -and $localSize -eq $remoteSize) {
        Write-Success "Verwende gecachtes HALOpy-Download (Groesse stimmt mit Remote ueberein)"
        $useCachedZip = $true
    }
    else {
        Write-Step "Gecachtes ZIP unterscheidet sich oder Groesse unbekannt; wird neu heruntergeladen..."
    }
}

if (-not $useCachedZip) {
    try {
        Invoke-WebRequest -Uri $HALOPY_REPO_URL -OutFile $zipPath -UseBasicParsing
        Write-Success "HALOpy heruntergeladen"
    }
    catch {
        Write-Error-Message "Fehler beim Herunterladen von HALOpy: $_"
        Write-Host "Sie koennen manuell herunterladen von: https://github.com/Molau/Halo/archive/refs/heads/main.zip"
        exit 1
    }
}

Write-Step "Dateien werden extrahiert..."

# Alten Extraktionsordner loeschen, falls vorhanden
if (Test-Path $extractPath) {
    Remove-Item $extractPath -Recurse -Force
}

Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

# Dateien aus extrahiertem Ordner in Installationsverzeichnis verschieben
$extractedFolder = Get-ChildItem -Path $extractPath -Directory | Select-Object -First 1
Copy-Item -Path "$($extractedFolder.FullName)\*" -Destination $INSTALL_DIR -Recurse -Force

Write-Success "Dateien extrahiert zu $INSTALL_DIR"

# Extraktionsordner aufraaeumen (ZIP fuer zukuenftige Laeufe aufbewahren)
Remove-Item $extractPath -Recurse -Force

# Schritt 3: Abhaengigkeiten installieren
Write-Header "Schritt 3: Python-Abhaengigkeiten installieren"

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
    Write-Step "Abhaengigkeiten aus requirements.txt installieren..."
    
    try {
        & $pythonCommand -m pip install --upgrade pip 2>&1 | Out-Null
        & $pythonCommand -m pip cache purge 2>&1 | Out-Null
        
        if (-not $IS_64BIT) {
            Write-Step "32-Bit Windows erkannt; vorinstallation von kiwisolver mit 32-Bit Rad..."
            & $pythonCommand -m pip install "kiwisolver==1.4.7"
        }
        
        & $pythonCommand -m pip install -r requirements.txt
        
        Write-Success "Abhaengigkeiten erfolgreich installiert"
    }
    catch {
        Write-Error-Message "Fehler beim Installieren von Abhaengigkeiten: $_"
        Write-Host "Sie koennen manuell installieren mit: $pythonCommand -m pip install -r requirements.txt"
    }
}
else {
    Write-ColorOutput Yellow "Warnung: requirements.txt nicht gefunden"
}

# Schritt 4: Start-Skript erstellen
Write-Header "Schritt 4: Start-Skript erstellen"

$batContent = @'
@echo off
REM HALOpy Launcher (Deutsch)
REM Erstellt durch install_de.ps1

cd /d "%~dp0"

REM Python-Befehl ermitteln (python, py -3, python3)
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
echo Fehler: HALOpy konnte nicht gestartet werden
echo Stellen Sie sicher, dass Python 3 installiert ist und in PATH verfuegbar ist
echo.
pause
goto :eof

:done
if errorlevel 1 (
    echo.
    echo Fehler: HALOpy wurde mit einem Fehler beendet
    echo.
    pause
)
:eof
'@

$batPath = Join-Path $INSTALL_DIR "halo.bat"
Set-Content -Path $batPath -Value $batContent -Encoding ASCII

Write-Success "Start-Skript erstellt: halo.bat"

# Schritt 5: Desktop-Verknuepfungen erstellen (optional)
Write-Header "Schritt 5: Desktop-Verknuepfungen erstellen"

$createShortcut = Read-Host "Desktop-Verknuepfungen erstellen? (J/N) [J]"
if ($createShortcut -eq "" -or $createShortcut -eq "J" -or $createShortcut -eq "j") {
    try {
        $WshShell = New-Object -ComObject WScript.Shell
        $desktopPath = [Environment]::GetFolderPath("Desktop")
        
        # Verknuepfung: HALOpy starten (Server + Browser oeffnet automatisch)
        $serverShortcutPath = Join-Path $desktopPath "HALOpy.lnk"
        $serverShortcut = $WshShell.CreateShortcut($serverShortcutPath)
        $serverShortcut.TargetPath = $batPath
        $serverShortcut.WorkingDirectory = $INSTALL_DIR
        $serverShortcut.Description = "HALOpy starten"
        $serverShortcut.Save()
        
        Write-Success "Desktop-Verknuepfung erstellt:"
        Write-Host "  - HALOpy.lnk (startet Server und oeffnet Browser automatisch)"
    }
    catch {
        Write-Error-Message "Konnte Desktop-Verknuepfungen nicht erstellen: $_"
    }
}

# Schritt 6: Datenverzeichnis einrichten
Write-Header "Schritt 6: Datenverzeichnis einrichten"

$dataDir = Join-Path $INSTALL_DIR "data"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    Write-Success "Datenverzeichnis erstellt: $dataDir"
}
else {
    Write-Success "Datenverzeichnis vorhanden: $dataDir"
}

# Installation abgeschlossen
Write-Header "Installation abgeschlossen!"

Write-Host ""
Write-ColorOutput Green "HALOpy wurde erfolgreich installiert!"
Write-Host ""
Write-Host "Installationsverzeichnis: $INSTALL_DIR"
Write-Host ""
Write-ColorOutput Cyan "Um HALOpy zu starten:"
Write-Host "  1. Doppelklicken Sie auf: $batPath"
Write-Host "  2. Oder fuehren Sie aus der Eingabeaufforderung aus: cd `"$INSTALL_DIR`" ; .\halo.bat"
Write-Host "  Der Browser oeffnet sich automatisch."
Write-Host ""
Write-ColorOutput Yellow "Erstes Mal einrichten:"
Write-Host "  - Legen Sie Ihre Beobachtungsdateien (.HAL, .CSV) in: $dataDir"
Write-Host ""

$startNow = Read-Host "HALOpy jetzt starten? (J/N) [N]"
if ($startNow -eq "J" -or $startNow -eq "j") {
    Write-Host ""
    Write-Step "HALOpy wird gestartet..."
    Start-Process -FilePath $batPath -WorkingDirectory $INSTALL_DIR
    Write-Host "HALOpy wird gestartet. Der Browser oeffnet sich automatisch."
}

Write-Host ""
Write-ColorOutput Green "Danke, dass Sie HALOpy installiert haben!"
Write-Host "Druecken Sie eine beliebige Taste zum Beenden..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
