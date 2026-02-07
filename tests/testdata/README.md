# Test Data Directory

Dieses Verzeichnis enthält temporäre Testdateien, die während der Testausführung erstellt werden.

## Verwendung

Die Tests erstellen automatisch Kopien von Produktionsdateien in diesem Verzeichnis:
- `test_halobeo.csv` - Kopie von `data/halobeo.csv` für Observer-Tests
- `test_observations.csv` - Testdatei für Observation-File-Tests (Layer 3a)
- Backup-Dateien mit `_backup.csv` Suffix

## Cleanup

Alle Testdateien werden nach Testausführung automatisch gelöscht.
Dieses Verzeichnis sollte immer leer sein (außer dieser README.md).

## .gitignore

Alle `*.csv` Dateien in diesem Verzeichnis sind in `.gitignore` ausgeschlossen:
```
tests/testdata/*.csv
```

---

*Dieses Verzeichnis wird von den Test-Scripts automatisch verwaltet.*
