# Dokumentation zum Haloerfassungsprogramm 'Halo' (Version 3.1)

## 1. Über das Programm selbst

HALOpy ist eine Web‑Anwendung zur Eingabe, Anzeige und Auswertung von Halobeobachtungen im standardisierten HALO‑Schlüsselformat. Die Bedienung erfolgt komfortabel im Browser, die bewährten Funktionen des Originalprogramms unter DOS bleiben erhalten. Beobachtungen können erfasst, gespeichert und als Monatsmeldungen sowie in vielfältigen statistischen Auswertungen dargestellt werden. Darüber hinaus lassen sich mit geladenen Daten komplette Monats‑ und Jahresstatistiken sowie Untersuchungen über größere Datenmengen erstellen.
Durch seine unterschiedliche Konfigurierbarkeit läßt sich das Programm problemlos an die speziellen Erfordernisse des jeweiligen Nutzers anpassen und ist auch als zentrales Erfassungsprogramm in der Meldestellegut geeignet. Es hält sich streng an die seit Januar 1978 in der Sektion Halobeobachtung verwendeten Verschlüsselungsvorschrift in der jeweils aktuellen Form.
Das Programm 'Halo' ist Public-Domain-Software, daß regelmäßig aktualisiert und verbessert wird. Es darf frei kopiert werden und ist vom Autor jederzeit kostenlos erhältlich. Die unter 6. genannten Copyrights sind zu beachten.
An dieser Stelle sei denjenigen gedankt, die sich den Haloschlüssel sehr zeitig ausdachten und somit die Voraussetzungen für die digitale Erfassung und die damit möglichen Auswertungen schufen.

Ab Version 3.1 unterstützt HALOpy zwei Betriebsmodi:

  * **Lokaler Modus** (Local Mode): Das Programm arbeitet wie bisher dateibasiert mit CSV-Dateien im lokalen Dateisystem. Alle Funktionen des Dateimenüs stehen zur Verfügung. Die Applikation wird lokal mit `python halo.py` gestartet und ist anschließend im Browser unter http://localhost:5000 erreichbar.
  * **Cloud-Modus** (Cloud Mode): Das Programm arbeitet datenbankbasiert als Mehrbenutzersystem. Der Zugriff erfolgt über https://halopy.online. Beim Start ist eine Anmeldung (Benutzername und Passwort) erforderlich. Jeder Benutzer hat Schreibzugriff nur auf die eigenen Beobachtungen und Beobachterdaten; Administratoren können alle Daten bearbeiten. Die Dateioperationen des Menüs 'Datei' entfallen, da die Datenhaltung vollständig über die Datenbank erfolgt.

In beiden Modi stehen Upload und Download von Beobachtungen und Beobachterdaten zur Verfügung (siehe 4.3 und 4.4).

## 2. Installation des Programms

### 2.1 Hardwarevoraussetzungen

HALOpy läuft als Web-Anwendung im aktuellen Desktop-Browser (Firefox, Chrome, Edge, Safari) mit aktivem JavaScript. Der Serverteil benötigt Python 3.x mit den in requirements.txt genannten Abhängigkeiten. Die Darstellung erfolgt über den Browser und Ausgaben werden mit der Druckfunktion des Browsers erzeugt. 

### 2.2 Installation

**Voraussetzung: Python Installation**

* **Windows**: Python ist NICHT in Windows enthalten. Laden Sie Python 3.10+ von [python.org](https://www.python.org/downloads/) herunter und installieren Sie es. Während der Installation aktivieren Sie "Add Python to PATH". `pip` wird automatisch mitinstalliert.
* **Linux**: Meist vorinstalliert. Falls nicht: `sudo apt install python3 python3-pip` (Debian/Ubuntu) oder entsprechendes Kommando für Ihre Distribution.
* **macOS**: Vorinstalliert ab macOS 10.15+, aber Sie können eine neuere Version über [Homebrew](https://brew.sh) installieren: `brew install python3`

**HALOpy Installation und Start:**

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

Anschließend öffnen Sie HALOpy im Browser über http://localhost:5000. Die Daten- und Ressourcendateien liegen im Projekt (z.B. data/, resources/), spezielle Treiber oder Installer sind nicht erforderlich.

## 3. Aufbau des Programms

### 3.1 Dateinamen

Programmdateien und Ressourcen liegen im Projektverzeichnis (z.B. templates/, static/, resources/). Beobachtungsdateien werden als CSV im Verzeichnis data/ verwaltet und können frei benannt werden (Standard: Endung .csv). Alte .HAL-Dateien müssen vorab in der DOS-Version des Programms nach CSV exportiert werden. Die Speicherung im standardisierten HALO-Schlüsselformat bleibt unverändert. Exporte für Weiterverarbeitung (z.B. Tabellenkalkulation) werden als CSV erzeugt.

### 3.2 Benutzung der Menüs

Die Bedienung erfolgt im Browser über die Navigationsleiste und Schaltflächen. Farben und Layout folgen dem Web-UI-Design (Bootstrap-ähnlich); es gibt keine farbcodierten DOS-Fenster mehr. 
Standardaktionen:

  * Navigation per Maus/Touch auf Schaltflächen und Links; Tastaturbedienung per Tab/Enter ist möglich.
  * ESC schließt Dialoge oder kehrt zur Hauptseite zurück (wie im Original vorgesehen).

Dialoge (z.B. Warnungen, Laden/Speichern) erscheinen als modale Overlays mit abgedunkeltem Hintergrund. Bei Eingabemasken wird Tastaturfokus automatisch gesetzt; Pflichtfelder sind gekennzeichnet.

### 3.3 Programmstart

**Lokaler Modus:** Starten Sie den Server:
* Windows: `python halo.py`
* Linux/macOS: `python3 halo.py`

Nach dem Start öffnen Sie HALOpy im Browser (Standard: http://localhost:5000).

Je nach Konfiguration kann beim Einstieg automatisch eine definierte Beobachtungsdatei geladen werden; andernfalls wählen Sie die Datei (CSV) über die Web-Oberfläche und arbeiten damit im Serverspeicher. Crash-Recovery ist aktiv: Falls während einer Sitzung eine Wiederherstellungsdatei mit der Endung `$$$` angelegt wurde, bietet HALOpy beim nächsten Start an, diese zu übernehmen, um Änderungen nicht zu verlieren. Nicht gespeicherte Änderungen werden zusätzlich beim Dateiwechsel oder Beenden abgefragt.

**Cloud-Modus:** Öffnen Sie https://halopy.online im Browser. Es erscheint zunächst die Anmeldeseite. Nach erfolgreicher Authentifizierung mit Benutzername und Passwort wird direkt die Arbeitsoberfläche geladen. Beobachtungs- und Beobachterdaten werden aus der Datenbank bezogen. Ein Abmelde-Button in der Navigationsleiste ermöglicht das Beenden der Sitzung.

Ein eigenes Endemenü existiert in der Web-Version nicht. Im lokalen Modus beenden Sie die Sitzung durch Schließen des Browser-Tabs; bei offenen, nicht gespeicherten Änderungen werden Sie gewarnt. Im Cloud-Modus verwenden Sie den Abmelde-Button.

## 4. Die Funktionen der einzelnen Programmpunkte

### 4.1 Das Versionsmenü '≡'

Das Versionsmenü im Kopfbereich zeigt Build-Informationen und die Änderungsübersicht der aktuellen HALOpy-Version.

  * 'Version': Zeigt Programm- und Build-Informationen der laufenden Instanz.
  * 'Was ist neu': Öffnet die hinterlegte Änderungsübersicht (whats_new_de/whats_new_en) für die aktuelle Version.

### 4.2 Das Menü 'Datei'

**Lokaler Modus:** Das Dateimenü steuert Laden, Speichern und Export der Beobachtungsdateien (CSV) im Browser. Alle Operationen arbeiten auf dem Serverspeicher; Änderungen werden beim Speichern zurück auf die Datei geschrieben.

  * 'Neue Datei': Legt eine leere Beobachtungsdatei im HALO-Schlüsselformat (CSV) an und lädt sie sofort zum Bearbeiten.
  * 'Laden': Wählt und lädt eine vorhandene CSV-Datei; nach dem Laden werden Dateiname und Anzahl der Beobachtungen angezeigt.
  * 'Selektieren': Filtert die geladene Datei nach Kriterien (z.B. Datum, Monat, Beobachter, Haloart) und erstellt eine neue Datei aus den Treffern oder aus den verbleibenden Datensätzen.
  * 'Verbinden': Führt die aktuell geladene Datei mit einer weiteren Beobachtungsdatei zusammen und entfernt doppelte Einträge; die Daten bleiben sortiert.
  * 'Speichern': Schreibt die aktuell geladene Datei aus dem Serverspeicher zurück. Bei ungesicherten Änderungen wird vor dem Laden anderer Dateien oder dem Beenden gewarnt.
  * 'Speichern unter': Sichert die geladene Datei unter neuem Namen und setzt die Arbeit mit der neuen Datei fort (Kopie).

Legacy .HAL-Dateien müssen in der DOS-Originalversion nach CSV exportiert werden; danach können sie geladen, selektiert oder verbunden werden. Eine direkte HAL-Konvertierung im Browser ist nicht vorgesehen.

Ein Verzeichniswechsel entfällt im Browser; die Dateiauswahl erfolgt über den Dateidialog des Betriebssystems.

**Cloud-Modus:** Das Menü 'Datei' entfällt im Cloud-Modus vollständig. Die Datenhaltung erfolgt über die Datenbank; Laden, Speichern und Dateiverwaltung sind nicht erforderlich. Der Schreibzugriff ist auf die eigenen Beobachtungen und Beobachter des angemeldeten Benutzers beschränkt. Administratoren haben Zugriff auf alle Daten.

**Beide Modi:** Folgende Funktionen stehen in beiden Betriebsmodi zur Verfügung:

  * 'Upload Beobachtungen': Lädt Beobachtungen im CSV-Format auf den Server hoch. Im lokalen Modus ist dazu eine vorherige Authentifizierung erforderlich. Dabei kann gewählt werden, ob bestehende Beobachtungen ersetzt oder ergänzt werden sollen.
  * 'Download Beobachtungen': Lädt Beobachtungen im CSV-Format vom Server herunter. Im lokalen Modus ist dazu eine vorherige Authentifizierung erforderlich. Es kann gewählt werden, ob nur eigene oder alle Beobachtungen heruntergeladen werden.

### 4.3 Das Menü 'Beobachtungen'

Dieses Menü bündelt Anzeige, Eingabe, Änderung und Löschung von Beobachtungen aus der geladenen Datei.

  * 'Anzeigen': Zeigt Beobachtungen gefiltert nach Kriterien (z.B. Jahr/Monat/Tag, Uhrzeit, Beobachter, Region, ...). Ausgabe erfolgt im Browser; wenn keine Treffer vorhanden sind, erscheint eine Warnung.
  * 'Hinzufügen': Öffnet die Eingabemaske nach HALO-Schlüssel. Eingaben werden sofort gegen die Validierungsregeln geprüft; unzulässige Kombinationen werden abgelehnt. Fest eingestellte Werte (z.B. fester Beobachter/Datum) werden übernommen, Pflichtfelder sind markiert.
  * 'Verändern': Sucht Beobachtungen nach Kriterien und erlaubt die Änderung einzelner Felder. Änderungen werden unmittelbar validiert; nach Speicherung bleibt die Sortierung erhalten.
  * 'Löschen': Sucht Beobachtungen nach Kriterien und entfernt ausgewählte Einträge aus der geladenen Datei.

Eingabearten:

  * Menüeingaben: Geführte Formulare mit Auswahlfeldern; geeignet, wenn die Beobachtung noch nicht kodiert vorliegt.
  * Zahleneingaben: Schlüsseleingabe als Zahlenkolonne gemäß HALO-Schlüssel; schneller für bereits kodierte Beobachtungen.

Alle Änderungen wirken auf den Serverspeicher und machen die Datei „unsaved“. Vor Dateiwechsel oder Beenden wird gewarnt. ESC schließt Dialoge ohne Übernahme von Änderungen.

### 4.4 Das Menü 'Beobachter'

Hier verwalten Sie Beobachterdaten (Kennzahl, Name, Beobachtungsorte mit Gültigkeit, Aktiv-Status). Änderungen werden sofort gespeichert.

  * 'Anzeigen': Öffnet die Beobachterliste (aktuelle Datensätze). Filter nach Kennzahl/Name, Ort oder Gebiet sind möglich.
  * 'Hinzufügen': Legt einen neuen Beobachter mit Kennzahl, Name, Haupt-/Nebenbeobachtungsort (inkl. Koordinaten/Gebiet) und Gültigkeitsbeginn an; Aktiv-Status wird gesetzt.
  * 'Verändern': Ändert Stammfelder (Kennzahl, Name) oder ortsbezogene Einträge mit Gültigkeit/Koordinaten/Aktivität; bestehende Ortseinträge können ergänzt oder gelöscht (mindestens einer bleibt) werden.
  * 'Löschen': Entfernt einen Beobachter einschließlich seiner Ortseinträge nach Sicherheitsabfrage endgültig.
  * 'Upload Beobachter': Lädt Beobachterdaten im CSV-Format auf den Server hoch. Im lokalen Modus ist dazu eine vorherige Authentifizierung erforderlich.
  * 'Download Beobachter': Lädt Beobachterdaten im CSV-Format vom Server herunter. Im lokalen Modus ist dazu eine vorherige Authentifizierung erforderlich.

### 4.5 Das Menü 'Auswertung'

In der Web-Oberfläche rufen Sie Auswertungen über die Seite „Auswertung“ auf. Es stehen numerische und grafische Ausgaben zur Verfügung; die Ergebnisse können als CSV/TXT oder (je nach Ansicht) als PNG gespeichert werden.

Parameterwahl und Optionen (entsprechend Originalverhalten):

  * Freie Parameter: 1D oder 2D über Schlüsselgruppen (z.B. Monat, Haloart, Cirrusgattung) oder Sonnenhöhe (min/mittel/max; nur DE-Daten).
  * Zeitbezug: Uhrzeit kann auf Ortszeit angepasst werden.
  * Dauer: Option, ob Einträge ohne Anfang/Ende (kA/kE) einfließen.
  * Haloart-Aufteilung: Option, vollständige Formen auf Einzelkomponenten aufzutrennen (z.B. linke/rechte Nebensonne).
  * Wolkengattungen: Option für Aufteilung analog zur Originalsoftware.
  * Werteberechnung: Absolutwerte, Prozentwerte; für 2D zusätzlich Normierung je X oder je Y.

Ausgabe:

  * Numerisch: Tabellenansicht im Browser, wahlweise als HTML-Tabelle, als Pseudografik (wie im DOS-Original) oder im Markdown-Format; bei großen Tabellen Navigation per Scrollen.
  * Grafisch: Linien- oder Balkendiagramm, optionaler PNG-Export.
  * Speichern: Ergebnisse können je nach Ansicht als CSV (HTML-Tabelle), TXT (Pseudografik) oder MD (Markdown) gespeichert werden; Grafiken als PNG.

### 4.6 Das Menü 'Ausgabe'

Das Menü führt zu drei Ausgabeseiten: Monatsmeldung, Monatsstatistik und Jahresstatistik. Voraussetzung ist eine geladene Beobachtungsdatei; andernfalls erscheint ein Warnhinweis. Die Ergebnisanzeige erfolgt im Browser.

Textausgabeformate: HTML-Tabelle (Web-Layout), Pseudografik (DOS-Layout) oder Markdown. Das gewählte Format gilt für alle drei Ausgaben. Speichern erfolgt formatabhängig: CSV bei HTML-Tabellen, TXT bei Pseudografik, MD bei Markdown. Drucken läuft über die Browser-Druckfunktion; Pseudografik- und Markdown-Ansichten werden dafür passend gerendert.

  * 'Monatsmeldung': Filterdialog für Beobachter (fester Beobachter wird vorgewählt, sonst Auswahl) sowie Monat/Jahr (Voreinstellung gemäß Datumsvorgabe). Ausgabe im gewählten Textformat; Speichern und Drucken direkt aus der Ansicht möglich.
  * 'Monatsstatistik': Auswahl Monat/Jahr, Ausgabe im gewählten Textformat mit Aktivitätstabelle; zusätzlich kann ein Aktivitätsdiagramm eingeblendet werden (Ansicht im Browser, druckbar). Speichern erzeugt CSV/TXT/MD gemäß Format.
  * 'Jahresstatistik': Auswahl Jahr, Ausgabe im gewählten Textformat (Übersichten und Aktivität). Ein Aktivitätsdiagramm kann angezeigt werden; Speichern erzeugt CSV/TXT/MD gemäß Format.

### 4.7 Das Menü 'Einstellungen'

Dieses Menü stellt die aktuellen Voreinstellungen bereit. Alle Änderungen werden direkt gespeichert und wirken sofort im Browser (keine Drucker- oder Farboptionen mehr nötig).

  * 'fester Beobachter': Voreinstellung des Beobachters für Eingabe- und Ausgabemasken (z.B. Monatsmeldung).
  * 'aktive Beobachter': Listen und Auswertungen wahlweise auf aktive Beobachter beschränken oder alle anzeigen.
  * 'Datei': Optional eine bestimmte CSV-Datei beim Programmstart automatisch laden.
  * 'Datum': Voreinstellung für Datumsprompts wählen: keine, aktueller Monat, Vormonat oder konstanter Monat (mit Monat/Jahr-Auswahl).
  * 'Eingabeart': Menüeingaben (geführte Formulare) oder Zahleneingaben (Schlüsselzeile) für Beobachtungsdialoge voreinstellen.
  * 'Ausgabeart': Textformat für Monatsmeldung/‑statistik/Jahresstatistik und Analyse wählen: HTML-Tabellen, Pseudografik oder Markdown (entsprechend werden CSV/TXT/MD erzeugt).
  * 'Passwort ändern' (nur Cloud-Modus): Ermöglicht dem angemeldeten Benutzer, sein Passwort zu ändern.

### 4.8 Das Menü 'Hilfe'

Das Menü Hilfe zeigt diesen Hilfetext direkt im Browser; Navigation erfolgt per Scrollen oder über interne Links. Die Sprache folgt der aktuellen Sitzungseinstellung.

### 4.9 'Abmelden' (nur Cloud-Modus)

Im Cloud-Modus steht in der Navigationsleiste der Button 'Abmelden' zur Verfügung. Er beendet die aktuelle Sitzung und kehrt zur Anmeldeseite zurück.

## 5. Zur Beachtung

Auch HALOpy ist umfangreich; melden Sie bitte gefundene Fehler mit kurzer Beschreibung (wann, wo, welche Aktion) und, falls möglich, mit verwendeter Datei. Rückmeldungen und Verbesserungsvorschläge sind willkommen; umsetzbare Ideen fließen nach Prüfung in neue Versionen ein.

Kontakt: Sirko Molau, Abenstalstr. 13b, D-84072 Seysdorf, E-Mail: sirko@molau.de

## 6. Copyrights

HALOpy nutzt Python, HTML/JS/CSS und läuft im Browser; siehe LICENSE für die aktuellen Lizenzbedingungen.
