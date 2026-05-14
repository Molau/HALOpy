**Ergänzungen und Änderungen in der Version 3.3**

Version 3.3 führt ein Fotoalbum für Halobeobachtungen ein (nur im Cloud-Modus).

- Fotoalbum: Zu jeder Beobachtung können Fotos hochgeladen, angesehen und gelöscht werden. Bis zu 10 Fotos pro Beobachtung sind möglich. Die Fotos werden in einer Thumbnailleiste unter dem Beobachtungsformular angezeigt; ein integrierter Bildbetrachter ermöglicht das Durchblättern sowie das Herunterladen und Löschen einzelner Aufnahmen.
- Beim Löschen einer Beobachtung kann optional das zugehörige Fotoalbum mit entfernt werden. Ist die Beobachtung die letzte eines Beobachters an diesem Tag, werden die Fotos automatisch mitgelöscht.
- Nutzungsrecht: Mit dem Hochladen eines Fotos erteilt der Bildautor dem AKM und seinen Mitgliedern das Recht, das Foto unter Angabe des Bildautors für vereinskonforme Zwecke zu verwenden – beispielsweise in Monatsberichten oder anderen Publikationen des AKM.

**Ergänzungen und Änderungen in der Version 3.2**

Version 3.2 ist die erste öffentliche Gemeinschaftsversion von HALOpy.

- Fotografische Beobachtung: Mit dem Schlüsselelement `#` können rein fotografische Beobachtungen gekennzeichnet werden. Sie erscheinen in der Beobachtungsliste, werden aber bei Statistik und Auswertung automatisch nicht berücksichtigt.
- UI-Verbesserungen: Die Beobachtungsanzeige unterstützt nun server-seitige Seitennavigation bei großen Datenmengen. Nach dem Löschen oder Ändern einer Beobachtung kann direkt die nächste Operation gestartet werden. Bei der Menueingabe kann die vorige Beobachtung als Vorlage übernommen werden. Im Cloud-Modus werden auf der Anmeldeseite nur Beobachter angezeigt, für die ein Passwort hinterlegt ist. Zusätzlich wurden zahlreiche kleinere Fehler behoben, u. a. bei der Modalnavigation, im mobilen Menü, der Startroutine im lokalen Modus sowie im ZZ-Feld.

**Ergänzungen und Änderungen in der Version 3.1**

Version 3.1 führt die Online-Version von HALOpy ein. Das Programm unterstützt nun zwei Betriebsmodi:

- Cloud-Modus (Online-Version): HALOpy kann als datenbankbasiertes Mehrbenutzersystem betrieben werden. Benutzer authentifizieren sich beim Start mit Benutzername und Passwort. Jeder Benutzer hat Schreibzugriff nur auf die eigenen Beobachtungen und Beobachterdaten; Administratoren können alle Daten bearbeiten. Ein Abmelde-Button in der Navigationsleiste beendet die Sitzung. Das Menü 'Datei' entfällt fast vollständig, da die Datenhaltung über die Datenbank erfolgt.
- Upload/Download von Beobachtungen: In beiden Betriebsmodi können Beobachtungen auf den Server hochgeladen oder vom Server heruntergeladen werden. Im lokalen Modus ist dazu eine vorherige Authentifizierung erforderlich.
- Upload/Download von Beobachterdaten: Analog zu Beobachtungen können Beobachterdaten hoch- und heruntergeladen werden. Im lokalen Modus ist dazu eine vorherige Authentifizierung erforderlich.
- Passwort ändern: Im Cloud-Modus kann das eigene Passwort über das Menü 'Einstellungen' geändert werden.

Der lokale Modus (dateibasierter Betrieb) bleibt vollständig erhalten und funktioniert wie gewohnt. Einzige Ergänzungen im lokalen Modus sind die neuen Upload- und Download-Funktionen.

**Ergänzungen und Änderungen in der Version 3.0**

Version 3.0 ist eine komplette Neuprogrammierung des ursprünglichen DOS-Programms. Es wurde sich dabei so eng wie möglich das bewährte Original-Programm gehalten und Änderungen nur dort vorgenommen, wo sie technisch zwingend erforderlich waren (z.B. DOS-abhängige Funktionen durch Web-Äquivalente ersetzen).

- Web-Umstieg und OS-Unabhängigkeit: Web-Applikation, Bedienung komplett im Browser; nicht mehr an DOS gebunden (kein DOS-Drucker-/Farbschalter).
- Datenhandling: Nur noch CSV – sowohl Beobachtungsdateien (*.HAL) als auch Beobachterdatei (HALO.BEO) sind auf CSV umgestellt; kein Anpassen/Transfer/Export alter HAL-Dateien im Programm, kein Verzeichniswechsel nötig.
- Anzeige/Analyse: Auswertung im Browser mit drei Textformaten (HTML-Tabellen, Pseudografik wie DOS, Markdown), Speichern als CSV/TXT/MD, Grafiken als PNG.
- Ausgabe: Monatsmeldung, Monats- und Jahresstatistik als Browser-Seiten, gleiches Textformat wie oben wählbar; Ausgabeziel (Bildschirm/Druck/Datei) wird erst in der Ergebnisansicht gewählt, Drucken läuft über den Browser.
- Filterdialoge: Alle Filter- und Parameterabfragen laufen gebündelt in einem Fenster statt in mehreren nacheinander geöffneten Dialogen.
- Internationalisierung: Deutsch/Englisch aus denselben Quellen, Sprachumschaltung zur Laufzeit.
- Programmende: Kein Ende-Menü mehr; Beenden durch Schließen des Browserfensters/Tabs.

**Ergänzungen und Änderungen in der Programmversion 2.5**

Bei der Version 2.5 handelt es sich um einen Bugfix. 
Bei der Auswertung von Beobachtungen eines bestimmten Monats wurde die Jahreszahl korrigiert.
Beim Verbinden von Halodatein wird geprüft, ob beide Files korrekt sortiert sind. Wenn nicht, werden sie nach einer Warnung an den Nutzer neu sortiert. 
Die Haloarten EE 41-43 wurden entsprechend des geänderten Haloschlüssels wieder in 90°-Nebensonnen umbenannt. Neu hinzu kamen die EE 73-76 (120°-Unternebensonnen) und EE 77 (Moilanenbogen). Die Probleme mit dem Font im Grafikmodus wurden behoben. Die Haloaktivität wird nur für Halos berechnet, die im Cirrus entstehen.
Als einzige Neuerung wurde das Dateimenü um die Funktion 'Exportieren' erweitert, mit der man alle Beobachtungen in eine Textdatei schreiben kann, um sie später mit anderen Programmen (z.B. EXCEL) auswerten zu können.


**Ergänzungen und Änderungen in der Programmversion 2.4**

Bei der Version 2.4 handelt es sich um ein Update, bei dem nur kleine Änderungen am Programm vorgenommen wurden. Einerseits konnten mehrere Fehler beseitigt werden, andererseits wurden die aktuellen Änderungen am Haloschlüssel in das Programm eingearbeitet.

Konkret gab es folgende Veränderungen:
Bei der Druckerausgabe von Monatsmeldungen und Monatsstatistiken kam es in seltenen Fällen zu Formatierungsfehlern, die behoben wurden. 
Die Berechnung der Haloaktivität in der Jahresstatistik war in der vorhergehenden Version fehlerhaft - es kamen andere Werte als bei der Monatsstatistik heraus. Dieser Mangel ist jetzt beseitigt. Zur Berechnung der Aktivität werden nur noch Beobachtungen herangezogen , die im Haupt- oder Nebenbeobachtungsort gewonnen wurden, da nur von diesen Orten die
geografischen Koordinaten vorliegen.
Das Schlüsselelement 'Cirrusdichte' wurde in 'Entstehungsort des Halos' umbenannt und um die Elemente 'Reif', 'Schneedecke', 'Eisnebel/Polarschnee' und 'Fallstreifen, Schneefall' ergänzt.
Schließlich wurde der Beobachtungsort als zusätzliches Sortierkriterium für Halobeobachtungen eingeführt. Zwei Beobachtungen gelten nur dann als gleich, wenn Datum, Uhrzeit, Beobachter, Haloart und Beobachtungsort übereinstimmen. Damit können Beobachtergruppen, die unter einer Beobachternummer laufen, jetzt auch Halos zur selben Zeit an verschiedenen Orten erfassen.

**Ergänzungen und Änderungen in der Programmversion 2.3**

Schwerpunkt bei der Aktualisierung des Programms war die Erfassung der geografischen Koordinaten von Haupt- und Nebenbeobachtungsort der einzelnen Beobachter. Sie werden nun zusammen mit dem jeweiligen Ortsnamen und dem Beobachtungsgebiet abgespeichert und ermöglichen eine genauere Berechnung der Sonnenstände zur Beobachtungszeit.
Die Zahl der Kriterien zur Selektion von Halobeobachtungen wurde erhöht. Nun kann eine Halodatei komfortabel nach allen auch bei der Auswertung zur Verfügung stehenden Parametern aufgeteilt werden.
Schließlich wurde ein kleiner Fehler bei der grafischen Auswertung behoben. Unter bestimmten Umständen kam es vor, dass die Beschriftung der Achsen bei Parametern, die unterschiedlich verschlüsselt werden können (z.B. EE 02 als 02 oder 04), Fehler aufwies. Nun ist die Anzeige korrekt.

**Ergänzungen und Änderungen in der Programmversion 2.2**

Der Hauptteil der Arbeit an der neuen Version bestand in der vollständigen Übersetzung des Programmes in die englische Sprache zusammen mit der Einführung der neuen Liste der Halotypen. Das wurde notwendig, weil mehr und mehr ausländische Halobeobachter Interesse an der Arbeit der SHB zeigen. Die Quelltexte wurden so umgestellt, dass alle Texte in eine extra Datei ausgelagert wurden. Diese existiert nun für zwei Sprachen, so dass unter Änderung von nur einer Datei die deutsche bzw. englische Programmversion erzeugt werden kann. Ein weiterer Vorteil besteht darin, dass beide Programme jederzeit völlig äquivalent sind, so dass keine Konsistenzprobleme auftreten können. Wird zukünftig eine Änderung am Haloprogramm vorgenommen, so werden automatisch beide Sprachversionen aktualisiert.
Natürlich war die Umstellung sehr komplex und hat fast alle Bereiche des Programms betroffen. Sollten Sie also auf merkwürdige Ausgaben stoßen oder Funktionen Probleme machen, die bisher reibungslos funktionierten, so informieren Sie mich bitte.
Weitere Ergänzungen und Änderungen sind schnell aufgezählt:
Neu angelegte Halodatein brachten das Programm beim Speichern unter Umständen zum Abbruch, was nun nicht mehr passiert.
Bei der Eingabe 'exotischer' Haloarten (EE 59-61) im Menümodus kam es bisher zur Vertauschung der EEs. Auch dieser Fehler ist nun behoben.
Wenn man große Dateien mit über 32768 Beobachtungen bearbeitet hat, traten in der alten Programmversion Zahlenüberläufe auf, so dass plötzlich negative Anzahlen von Beobachtungen angezeigt wurden. Auch dieses Problem ist nun behoben.
Der Ausdruck von Tabellen und Grafiken mit einem Tintenstrahldrucker wurde an mehreren Stellen modifiziert. So werden die Linien im Aktivitätsgraph bei Montas- und Jahresstatistiken nun schmaler gedruckt, was die Übersichtlichkeit erhöht. Außerdem wurde die Größe der Tabellen in der Monatsstatistik angepasst.
Schließlich wurde die Auswertung dahingehend erweitert, dass zusammengesetzte Schlüsselelemente bei der Cirrusgattung (C 4-7) nun ähnlich wie vollständige Haloformen optional auf die einzelnen Elemente (Ci, Cc, Cs) aufgeteilt werden können.
Zusätzlich wurde die Selektion von Beobachtungen nach dem Beobachtungsort aufgenommen, was vor allem die statistische Auswertung langer Reihen einzelner Beobachter unterstützt.

**Ergänzungen und Änderungen in der Programmversion 2.1**

Auf den ersten Blick hat sich in der neuen Programmversion wenig im Vergleich zur vorhergehenden geändert. Das spricht dafür, dass sich die Programmstruktur als solche generell bewährt hat und ich nur kleine Veränderungen und Ergänzungen vornehmen musste.
Wie jedes Mal waren mehrere kleine und selten auftretende Programmfehler aufzuspüren und zu beheben, wobei mir vor allem die 'Beta-Tester' Wolfgang Hinz und Gerald Berthold viele wichtige Hinweise gaben. Auf ihre Anregung hin wurden auch einzelne Menüs erweitert bzw. neue Funktionalität hinzugefügt, um die Auswertung der Halobeobachtungen noch effektiver zu gestalten.
Die Version 2.1 ist die erste Programmversion, die auf die kompletten Datenbestände der Sektion Halobeobachtung im AKM zurückgreifen kann. Während ich die ersten Jahrgänge noch selber in stundenlanger Hackerei in den Computer speisen musste, wurde diese Arbeit nu vollständig von Wolfgang und Gerald übernommen und zu Ende geführt. Auch dafür möchte ich Ihnen danken. Mit den jetzt erfassten 30000 Halobeobachtungen wird eine neue Qualität in der Auswertung von Halobeobachtungen erreicht, weil nun selbst seltenere Haloformen in größerer Zahl vertreten sind.
Die neue Version trägt dieser Datenmenge speziell Rechnung, indem eine weitere Kompression der Halodatein eingeführt wurde. Der jetzt erreichte Grad ist nahe dem minimal möglichen Wert und wird kaum noch zu verbessern sein.
Natürlich wurde der seit Anfang 1995 gültige neue Haloschlüssel implementiert und die alten Dateien entsprechend angepasst. Die mit dem Programm mitgelieferten Halodatein stellen nun die 'Standardbeobachtungen' im SHB dar. Wer gern Dateien mit eigenen Beobachtungen nutzen möchte, kann sich diese aus den jeweiligen Jahresdateien neu selektieren.
Die Unterstützung für Drucker wurde weiter verbessert. So traten in der letzten Version regelmäßig Fehler beim Laden von Druckertreibern auf, die jetzt beseitigt sind. Auch bietet einem die Version 2.1 als Ergänzung zu den bisherigen Druckern die Option Laserdrucker an. Dabei wird ein HP-LaserJet und alle kompatiblen Druckertypen angesteuert.

*Menü 'Datei'*
Die einzige Änderung in diesem Menü betrifft den Unterpunkt Selektieren. Als neue Selektierkriterien wurden das Beobachtungsdatum und das Objekt aufgenommen. Zusätzlich wird der Nutzer gefragt, ob er die selektierten Beobachtungen erhalten oder löschen möchte. Damit kann er nun nicht nur ganz gezielt Beobachtungen extrahieren, sondern auch löschen.

*Menü 'Beobachtungen'*
Auch die Auswahlkriterien zur Anzeige von Beobachtungen wurden verändert, um die Einheitlichkeit des Programms zu gewährleisten. Hat man eine Anzahl von Beobachtungen zur Anzeige gebracht, kann man diese nun sowohl im Zahlenmodus als auch im Menümodus ausdrucken. Das unterstützt vor allem die gezielte Suche nach Beobachtungen und erspart im entscheidenden Augenblick das Abschreiben vom Bildschirm.
Das Verändern von Beobachtungen wurde ebenfalls komfortabler gestaltet. Wenn man bisher bei mehreren Beobachtungen dieselben Parameter ändern wollte, musste man diese nacheinander einzeln auswählen und modifizieren. Die aktuelle Version gestattet es, Gruppen von Beobachtungen über bestimmte Kriterien zu spezifizieren, an denen die Änderungen vorgenommen werden sollen. Man gibt nachfolgend einmal die Veränderungen vor und das Programm ändert dann automatisch alle gewählten Beobachtungen bzw. erbittet zu jeder gefundenen Beobachtung eine Bestätigung.

*Menü 'Auswertung'*
Im Auswertemenü wurden einige kleine Ergänzungen vorgenommen. So kann der Nutzer bei Auswertungen über die Halodauer entscheiden, ob er Beobachtungen ohne Anfang oder Ende aussortieren möchte. Das Programm erkennt diese Beobachtungen an den Zeichenketten 'kA' und 'kE' in beliebiger Position im Bemerkungsteil einer Beobachtung.
Außerdem können Grafiken nicht nur wie bisher gespeichert, sondern auch als BMP-Bild exportiert werden. Da dieses Grafikformat von vielen Textsystemen und Grafikprogrammen gelesen werden kann, ist nun eine Einbindung von Auswertungsergebnissen in andere Dokumente möglich. Sollte ein Programm nicht das BMP-Format von Windows kennen, kann man die Bilder leicht mit Shareware-Programmen wie 'Graphic Workshop' in jedes beliebige andere Bildformat konvertieren.

 *Menü 'Ausgabe'*
Die letzten Änderungen in der aktuellen Programmversion betreffen die Monats- und Jahresstatistiken. So gab es bisher Probleme mit dem Ausdruck, wenn eine Monatsstatistik über mehrere Seiten ging. Diese sind nun neben einer Zusätzlichen Umstrukturierung der Monatstabelle für EE über 12 behoben. Außerdem kann man sowohl in der Monats- als auch in der Jahresstatistik den Aktivitätsgraphen getrennt von den Tabellen ausdrucken.

**Ergänzungen und Änderungen in der Programmversion 2.0**

*Generelles*
Die in dieser Programmversion verwirklichten Ideen und Verbesserungen beruhen zum großen Teil auf Hinweisen, die ich von verschiedenen Halobeobachtern erhalten habe. Das bezieht sich sowohl auf einige versteckte Fehler, welche von aufmerksamen Benutzern aufgespürt wurden, als auch auf Verbesserungsvorschläge bezüglich der Benutzerfreundlichkeit und Funktionalität des Programmes.
Einer der wesentlichen Vorteile der neuen Programmversion besteht in der programminternen Pufferung aller Lese- und Schreiboperationen auf Halodatein. Damit wird nicht nur eine kompaktere Speicherung der Daten, sondern vor allem auch eine schnellere Arbeit mit großen Dateien erreicht. Das einfache Kopieren von Halodatein geschieht in der aktuellen Programmversion bei Verwendung von Festplattencacheprogrammen etwa 2x schneller als früher, ansonsten konnte die Lese- und Schreibzeit sogar auf ein Fünftel reduziert werden!
Im Gegensatz zur allgemeinen Programmstruktur, die nahezu unverändert blieb, mussten an fast allen Dateistrukturen Veränderungen vorgenommen werden.
So wird jetzt bei allen vom Programm erstellten Dateien die aktuelle Versionsnummer des Haloprogramms mit gespeichert. Damit kann problemlos überprüft werden, ob die verwendeten Dateien veraltet und unbrauchbar sind bzw. ob sie vor ihrer Verwendung angepasst werden müssen.
Bei Halobeobachtungsdatein ist das Bemerkungsfeld von 10 auf 60 Zeichen vergrößert worden, womit nun auch umfangreichere Kommentare zu jeder Beobachtung möglich sind. Auch die Felder Wetterfront, Vollständigkeit, und Sektoren wurden an die neue Kodierung zu diesem Schlüsselelement angepasst. Verständlicherweise sind damit die bisher verwendeten Beobachtungsdateien nicht mehr vom Programm lesbar. Sie müssen erst über den neuen Menüpunkt 'Datei' -> 'Anpassen' in das aktuelle Format konvertiert werden.
Die Datei der Halobeobachter 'Halo.BEO' musste völlig umstrukturiert werden - ältere Versionen dieser Datei sind daher nicht mehr verwendbar. Für die Benutzer grafischer Oberflächen ist nun neben einem Icon für das Betriebssystem OS/2 ('Halo.OS2') auch ein Symbol für Windows vorhanden ('Halo.ICO').
Probleme die bisher beim Ausdruck von Grafiken mit Tintenstrahldruckern auftraten, sind in der aktuellen Programmversion beseitigt.

*Menü 'Datei'*
Als neuer Unterpunkt findet sich hier das Anpassen von Halobeobachtungsdatein älterer Programmversionen. Bei Anwahl dieses Punktes ist zu entscheiden, ob eine bestimmte oder alle Dateien des aktuellen Arbeitsverzeichnisses angepasst werden sollen. Nach der Konvertierung können die entsprechenden Dateien wieder vom Programm geladen werden.
Beim Verbinden von Dateien konnte es bisher in seltenen Fällen auftreten, dass gleiche Beobachtungen in beiden Dateien nicht als solche erkannt und daher doppelt in die Ergebnisdatei übernommen wurden. Dieser Fehler ist nun beseitigt. 
Weiterhin gab es Probleme, wenn das Programm auf Diskette gespeicherte Halodatein nutzen sollte. In der aktuellen Version wird nun zuerst geprüft, ob noch genug Speicherplatz auf der Diskette vorhanden ist, bevor das Programm auf die Diskette zugreift.
Als weiterer neuer Menüpunkt ist das übertragen von Dateien aufgenommen worden. Bei Anwahl dieses Punktes ist zu entscheiden, ob man eine Datei (per E-Mail) versenden oder empfangen möchte. Wird das Dateisenden gewünscht, erzeugt das Programm zur aktuell bearbeiteten Halodatei eine gleichnamige Textdatei mit der Endung 'ASC'. Da diese Datei nur ASCII-Zeichen vor 127 und keine Steuerzeichen enthält, kann sie problemlos als Mail verschickt werden. Beim Empfangen von Dateien sucht man aus einem Menü die gewünschte Datei mit der Endung 'ASC' heraus. Diese Datei muss vorher mit 'Halo' erstellt worden sein, kann jedoch am Anfang und Ende um Text ergänzt worden sein, der ignoriert wird. Man gibt einen neuen Dateinamen ein und die empfangene Datei wird wieder in das ursprüngliche Format zurückkonvertiert.

*Menü 'Beobachtungen'*
In diesem Menü wurde nur kleinere Veränderungen vorgenommen. Eine davon ist die Eingabemaske, die nun bei der Menüeingabe von Kommentaren zu Beobachtungen angezeigt wird. Damit kann man leichter einschätzen, wie lang der entsprechende Kommentartext sein darf (maximal 60 Zeichen).
Bei der Eingabe oder der Veränderung von Beobachtungen in Orten mit GG>11 wurde bisher auf Grund eines Programmfehlers ein falsches Beobachtungsgebiet abgespeichert. Auch dieser Fehler ist nun behoben.
Bei der Eingabe von Lichtsäulen lässt das Programm in der neuen Version unbekannte Lichtsäulenhöhen zu.
Um auch eventuell noch unbekannte Haloformen erfassbar zu machen, wurde die Haloart 'unbekanntes Halo' (EE 73) eingeführt.
Bei der ausführlichen Ausgabe einer Halobeobachtung erscheint in der neuen Programmversion nicht mehr der Text Haupt- oder Nebenbeobachtungsort sondern gleich der Name des entsprechenden Beobachtungsortes.

*Menü 'Beobachter'*
In diesem Menüpunkt mussten auf Grund der veränderten Struktur der Beobachterdatei größere Veränderungen vorgenommen werden. Generell werden die Informationen zu jedem Halobeobachter (Datei 'Halo.BEO') nun in zwei Teilen gespeichert:
Während in einem festen Teil nur die Grundangaben (Name und Kennnummer des Beobachters) gespeichert sind, enthält ein variabler Teil beliebig viele Ortseinträge (bestehend aus Haupt- und Nebenbeobachtungsort, dem Datum der ersten Gültigkeit und der Beobachteraktivität). Damit ist es nun einerseits möglich, Lücken in der Aktivität von Halobeobachtern richtig zu speichern, andererseits entfällt an mehreren Stellen des Programms die Abfrage nach der Aktivität von Beobachtern.
Der Unterpunkt 'Anzeigen' bringt in seiner neuen Form zu jedem Beobachter die Grundangaben sowie den jeweils aktuellen Ortseintrag zur Anzeige.
Mit dem Unterpunkt 'Hinzufügen' wird ein völlig neuer Beobachter in die Beobachterdatei aufgenommen. Dazu werden sowohl die festen Daten als auch der erste Beobachtungsort und das erste Beobachtungsdatum erfasst. Der Beobachter wird automatisch als aktiv eingestuft.
Das 'Verändern' von Beobachtern ist bedingt durch die neue Dateistruktur etwas komplexer geworden: Man kann wie bisher die Grundangaben zu jedem Beobachter manipulieren. Zusätzlich hat man jedoch die Möglichkeit, sich alle variablen Ortseinträge in Listenform ausgeben zu lassen, solche Einträge zu ergänzen und sie auch wieder zu löschen. Generell ist dabei zu beachten, dass der letzte vorhandene Ortseintrag nie gelöscht werden kann, da sonst Informationen zum Beobachter fehlen werden.
Das völlige löschen von Beobachtern ist wie bisher nur vom Unterpunkt 'Löschen' aus möglich.
In allen genannten Menüpunkten wurden die vorher vorhandenen Auswahlkriterien Name und Beobachterkennzahl zu einem Kriterium zusammengefasst. Man kann den gewünschten Beobachter nun also nur noch direkt aus einer Liste aller mit Kennzahl gespeicherten Beobachter auswählen.

*Menü 'Auswertung'*
Der Menüpunkt 'Auswertungen' wurde um verschiedene Funktionen ergänzt und an einigen Stellen verbessert:
Die Bezeichnungen 'Halotyp' wurde der Eindeutigkeit halber in 'Haloart' und 'Haloart' in 'Objekt' umgeändert.
Um Probleme bei der Auswertung mit unvollständigen und vollständigen Haloformen (Beispiel linke/rechte Nebensonne - beide Nebensonnen) zu vermeiden, wird in der vorliegenden Programmversion grundsätzlich nach der Art der Verwendung solcher Haloformen gefragt.
Auf speziellen Wunsch wurde die Liste der möglichen freien und festen Parameter um die Dauer bis zum Niederschlag (DD) und das Datum (TT) ergänzt. Die Wahl des Datums als freien Parameter ermöglicht Untersuchungen zum Halogeschehen innerhalb eines Monats. Zwangsweise müssen dabei Monat und Jahr der Beobachtungen festgelegt werden. Untersuchungen zum Halogeschehen eines bestimmten Tages werden durch das Datum als festen Parameter möglich.
Die Auswertung über den Parameter 'Stunde' wurde dahingehend verbessert, dass nicht mehr die Startzeit sondern (berechnet aus der Halodauer) alle Stunden beachtet werden, in denen ein Halo sichtbar war.
Auch spezielle Auswertungen über Halophänomene werden von der neuen Programmversion unterstützt. Als zu einem Phänomen gehörige Beobachtung wird dabei jede Beobachtung interpretiert, bei der im Bemerkungsteil ein Stern (*) auftaucht.
Fehler traten bisher bei Auswertungen mit festgelegten Sektoren von ringförmigen Halos auf. In der neuen Programmversion ist das behoben.

*Menü 'Ausgabe'*
Bei der Ausgabe von Monatsmeldungen wurde bisher in seltenen Fällen ein falscher Beobachtungsort angegeben. Außerdem gab das Programm in bestimmten Situationen auf Grund eines versteckten Programmfehlers Sektoren zu nichtkreisförmigen Halos aus. Beide Fehler wurden in der neuen Version beseitigt.
Bei der Ausgabe von Monatsmeldungen oder Statistikergebnissen in Dateien erfolgt in der neuen Programmversion die Abfrage, ob Pseudografiksymbole verwendet werden sollen oder nicht. Das erleichtert den Transport über Computernetze, weil die ohne Pseudografiksymbole erzeugten Dateien nun direkt als Textdatei per elektronischer Post verschickt werden können.
Die Monatsstatistik wurde an verschiedenen Stellen neu formatiert. Um sie weiter an das bisher in den Halomitteilungen verwendete Format an- zupassen, werden nun in der Beobachterübersicht Unterstreichungen und 'X' zur Kennzeichnung von Mondhalos verwendet. Weiterhin entfällt die bisher übliche Abfrage über aktive Beobachter, da wie bereits beschrieben die Struktur der Beobachterdatei verändert wurde.
In der jetzigen Form werden nicht mehr nur Beobachtungen aus Deutschland in der Monatsstatistik beachtet, sondern auch aus allen Nachbarländern sowie von Beobachtern mit Haupt- oder Nebenbeobachtungsgebiet im Ausland.
Die Jahresstatistik wurde in der neuen Programmversion um die Tabelle der im Jahr aufgetretenen Halophänomene ergänzt.
Zusätzlich wird nun in beiden Statistiken die monatliche/jährliche Haloaktivität berechnet und als Text sowie als Diagramm ausgegeben. Es handelt sich dabei um zwei Zahlen (reale und relative Aktivität), die das Halogeschehen im entsprechenden Zeitraum bedeutend besser dokumentieren als nur die einfache Anzahl der Halobeobachtungen. Die Haloaktivität berechnet sich nach einem Vorschlag von G. Berthold wie folgt:
Zuerst wird jedem gesichteten Halo ein Gewicht zugeordnet. Gewicht = Haloartfaktor * Halohelligkeitsfaktor * Halodauer / 60 min 
Ein Halo erhält dabei ein umso größeres Gewicht, je seltener und heller es ist (z.B. EE 01 = 1, EE 02/03 = 2 ... EE 72 = 100; H 0 = 0.8 ... H 3 = 1.4).
Die reale Haloaktivität eines Tages ergibt sich nun für jeden Beobachter als die Summe der Gewichte aller beobachteten Halos. Um die relative Haloaktivität zu berechnen, multipliziert man den erhaltenen Wert mit 12 Stunden und dividiert ihn durch die theoretische mögliche Sonnenscheindauer am entsprechenden Tag. Letztendlich berechnet sich die Haloaktivität eines Tages aus der Summe der entsprechenden Haloaktivitäten der einzelnen Beobachter geteilt durch die Anzahl der im entsprechenden Monat aktiven Halobeobachter.
Die reale und relative Monatsaktivität erhält man, indem man alle Tagesaktivitäten aufsummiert und so gewichtet, als hätte jeder Monat 30 Tage.
Neben der Tabellenausgabe der Haloaktivität bietet das Programm auf grafikfähigen Rechnern Zusätzlich die Möglichkeit, Diagramme über beide Aktivitätszahlen auf dem Bildschirm darzustellen bzw. auszudrucken.

*Menü 'Einstellungen'*
Dieses Menü wurde um den Unterpunkt 'Bildschirm' ergänzt. Hier kann man den Typ des verwendeten Monitors angeben. Wählt man die Option Farbmonitor, so bleibt die Farbpalette wie bisher unverändert. Anderenfalls werden jedoch nur noch wenige und kontrastreiche Grautöne im Programm verwendet, so dass auch Nutzer von S/W-Monitoren gut mit der Färbung von Menüpunkten und Fenstern zurechtkommen.
Eine letzte Änderung betrifft den Programmstart: Das Programm sucht nun nicht mehr im Startverzeichnis sondern im voreingestellten Datenverzeichnis nach temporären Dateien.

**Ergänzungen und Änderungen in der Programmversion 1.1**

*Generelles*
Die in dieser Version gemachten Veränderungen beinhalten im Wesentlichen die Beseitigung kleiner Fehler und das Ergänzen einer Reihe von zusätzlichen Programmfunktionen. Es wurde jedoch keine grundsätzlichen Veränderungen an der Programmstruktur vorgenommen, so dass das Programm auf den ersten Blick kaum Veränderungen zeigen wird.
Durch veränderte Compileroptionen konnte die Programmgeschwindigkeit teilweise verdoppelt werden. Das macht sich besonders bei komplexeren Auswertungen über große Datenmengen positiv bemerkbar. Bei der Berechnung von Auswertungen wird nun auch ein mathematischer Coprozessor unterstützt, was die Rechenzeit in Extremfällen Zusätzlich noch einmal auf ein Fünftel verringert.
Die Funktionalität der Menüs hat sich in zwei Punkten verändert. Zum einen gelangt man jetzt mittels der Tasten Pos1 oder Ende bzw. Bild auf und ab sehr schnell an den Anfang oder das Ende eines Menüs, und Außerdem erreicht man den Programmpunkt 'Ende' nun auch durch einfaches Betätigen der ESC-Taste im Hauptmenü.

*Versionsmenü '?'*
Bei Anwahl dieser Menüpunktes erscheint in der vorliegenden Programmversion ein neues Untermenü, das die Punkte 'Version' und 'Was ist neu' enthält. Während beim ersten Menüpunkt wie gewohnt der Versionstext zur Anzeige kommt, können Sie mit dem zweiten Punkt diesen Änderungstext lesen.

*Menü 'Datei'*
In diesem Menü wurde der Punkt 'Selektieren' ergänzt. Er ermöglicht die Auswahl und nachfolgende Speicherung von bestimmten Beobachtungen aus der aktuell geladenen Datei. Als Auswahlkriterium stehen dabei die Beobachterkennzahl, der Beobachter, der Monat, das Jahr und das Beobachtungsgebiet zur Verfügung. Der neue Menüpunkt gestattet es also zum Beispiel, aus einer Sammeldatei die Beobachtungen eines bestimmten Beobachters herauszufiltern und in einer neuen Datei zu speichern.

*Menü 'Beobachtungen'*
Bei der Anzeige von Beobachtungen im Modus 'Menüeingaben' wurde in der vorhergehenden Version die Wetterfront fehlerhaft ausgegeben. Dieser Fehler ist nun behoben. Im Modus 'Zahleneingaben' wurde weiterhin ein kleiner Fehler bei der Eingabe zu langer Bemerkungen beseitigt.
Bei der Auswahl anzuzeigender Beobachtungen steht Zusätzlich zu den bisher vorhandenen fünf Kriterien nun auch der Halotyp zur Verfügung.

*Menü 'Auswertung'*
In diesem Menüpunkt wurden umfangreiche Erweiterungen vorgenommen. Gleich im ersten Untermenü fällt als neuer Menüpunkt das Laden von Auswertungen auf. Man kann damit bereits erstellte Auswertungen in kurzer Zeit auf den Bildschirm bringen und eventuell weiterbearbeiten. Dazu ist lediglich aus der Liste der gespeicherten Auswertungen die gewünschte auszuwählen, und in Kürze erscheint ohne umfangreiche Berechnungen dasselbe Bild, das zur Zeit der Speicherung zu sehen war.
Weiterhin sind der neuen Programmversion 3 neue Auswertekriterien aufgenommen worden: die Sonnenhöhe, die Höhe von Lichtsäulen und Segmente bei ringförmigen Halos. Die Sonnenhöhe kann dabei nur für Beobachtungsorte in Deutschland und ausschließlich in 2°-Schritten berechnet werden (das Programm verwendet dabei mittlere geografische Koordinaten der einzelnen Beobachtungsgebiete). Der Nutzer muss zudem entscheiden, ob die minimale, mittlere oder maximale Sonnenhöhe im Zeitintervall der Beobachtung berechnet werden soll.
Bei der Auswahl der Uhrzeit als Auswertungsparameter muss der Nutzer in der neuen Version eine weitere Entscheidung treffen: Er kann sowohl eine Auswertung für die Ortszeit(zone) der Beobachtung bzw. für die gespeicherte MEZ vornehmen.
Wenn Sie ein Beobachtungsgebiet als festen Parameter einstellen wollen, so können sie in ab jetzt auch 'Deutschland' wählen (GG 12), wobei alle in Deutschland gemachten Beobachtungen Verwendung finden. Sollen die Auswertungen für einen bestimmten Halotyp eingeschränkt durchgeführt werden, so ist nun auch die Beachtung kompletter Haloformen nach Abfrage durch das Programm möglich (z.B. Einbeziehung der Halotypen EE=2 und EE=4 für die Beschränkung auf linke Nebensonnen).
Die bei der grafischen Auswertung bisher stellenweise auftretende Überschneidung von Zahlen an Diagrammen tritt nun nicht mehr auf. Auch die Vertauschung von oberem und unterem Berührungsbogen wurde beseitigt.
Weiterhin wurde das Glätten von Auswertungsgraphen weiter verfeinert. Man hat nun die Möglichkeit, nicht nur die Stärke sondern auch die Art der Glättung einzustellen. Er kann entweder wie bisher explizit über beide Achsen oder nur entlang einer Achse glätten. Das kann je nach Art der gewählten Auswertung sinnvoll sein, um einem Informationsverlust beim Glätten vorzubeugen.
Bisher waren zweidimensionale Diagramme manchmal wenig aussagekräftig, da der größte Teil von Ihnen auf Grund einer schlechten Parameterwahl verdeckt wurde. Dieser Fall tritt nun so gut wie nicht mehr auf, da man sich das Diagramm durch die neue Option der Änderung der Achsenorientierung immer in eine günstige Position drehen kann.
Zu jedem Zeitpunkt kann man wie bereits erwähnt Auswertungen abspeichern. Dazu ist nach Berechnung eines Diagramms oder einer Tabelle lediglich die entsprechende Taste zu drücken und ein Dateiname für die Auswertung zu wählen. Die Dateien erhalten vom Programm dann automatisch die Endung 'HAW'.

*Menü 'Ausgabe'*
Dieses Menü hat sich am meisten geändert. Neben der bisher möglichen Ausgabe der Ergebnisse auf Drucker und Bildschirm wurde die Option der Ausgabe in eine Datei ergänzt. Der Dateinamen wird dabei automatisch generiert und erhält je nach gewählten Menüpunkt die Endung 'MMG' (Monatsmeldung), 'MST' (Monatsstatistik) oder 'JST' (Jahresstatistik).
Bei der Ausgabe von Beobachtungsformularen kam es bisher vor, dass sehr lange Ortsnamen nicht vernünftig auf der Ausgabeeinheit dargestellt wurden. Das ist in dieser Version verbessert worden. Weiterhin wurden die kompletten Algorithmen zur Erstellung von Monats- und Jahresstatistiken überarbeitet. Die jetzt berechneten Werte werden nach genau demselben Schema wie in den Halomitteilungen berechnet, so dass keine Differenzen mehr zwischen den hier und dort genannten Beobachtungszahlen vorliegen.

*Menü 'Einstellungen'*
Im Menü Einstellungen wurde der Menüpunkt 'Drucker' neu hinzugefügt. Hier legt man zuerst fest, ob man einen Nadeldrucker oder Tintenstrahldrucker angeschlossen hat. Bei Nadeldruckern werden zur Steuerung der Druckerausgaben programmintern die EPSON-Escapesequenzen verwendet, während bei Auswahl von 'Tintenstrahldrucker' der HP-Standard Verwendung findet.
Hat man 'Nadeldrucker' gewählt, so entscheidet man in der folgenden Auswahl, ob der angeschlossene Drucker nach jeder ausgedruckten Seite einen zusätzlichen Seitenvorschub durchführen soll oder nicht. Ein solcher Seitenvorschub ist bei einigen Druckern im Einzelblattbetrieb sinnvoll, bei anderen Druckern oder bei der Arbeit mit Endlospapier jedoch sehr störend.
