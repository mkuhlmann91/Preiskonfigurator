# LEDWALL 360 Konfigurator

Live unter https://konfigurator.ledwall-360.de (GitHub Pages).

- `/` – Startseite: Auswahl Mobil / Festinstallation
- `/mobil/` – Konfigurator für mobile LED-Wände (Traverse, Boden)
- `/fest/` – Konfigurator für Festinstallationen (Indoor, Turnhalle, Panels 960 × 960 mm, Wandhalterung)
- `shared/` – gemeinsamer Code (CSS + JS) für alle Konfiguratoren
- `assets/` – Logo, Vorschaubilder

Alte Links mit Konfiguration (`/#ort=…`) leiten automatisch auf `/mobil/` weiter.

Wichtig bei Änderungen an `shared/konfigurator.js` oder `shared/konfigurator.css`: die Versionsnummer `?v=…` in den vier `index.html` (`mobil`, `fest`, `mobile/english`, `fixed/english`) hochzählen, sonst zeigen Browser bis zu 10 Minuten die alte Datei.
