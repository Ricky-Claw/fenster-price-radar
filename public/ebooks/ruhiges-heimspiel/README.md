# Ruhiges Heimspiel – PDF-E-Book

10-seitiges A4-E-Book für den Deutschen Fenstershop zur Fußball-/WM-Aktion.

**Titel:** „Ruhiges Heimspiel – Public Viewing draußen. Ruhe drinnen.“

## Dateien

- `index.html` – Inhalt und Seitenstruktur
- `styles.css` – A4-/Print-Design
- `assets/fenstershop-logo.png` – freigestelltes Fenstershop-Logo aus `src/Logo-Freigestellt.png`
- `export-pdf.js` – PDF-Export per lokal installiertem Chromium/Chrome
- `ruhiges-heimspiel-ebook.pdf` – erzeugtes PDF

## Vorschau

Lokal aus dem Repo:

```bash
python3 -m http.server 8080
```

Dann öffnen:

```text
http://localhost:8080/public/ebooks/ruhiges-heimspiel/
```

Nach Vite/Vercel-Build ist das E-Book erreichbar unter:

```text
/ebooks/ruhiges-heimspiel/
```

## PDF exportieren

```bash
node public/ebooks/ruhiges-heimspiel/export-pdf.js
```

Wenn Chromium nicht automatisch gefunden wird:

```bash
CHROME_PATH=/pfad/zu/chrome node public/ebooks/ruhiges-heimspiel/export-pdf.js
```

## Prüfpunkte

- echtes Fenstershop-Logo gesetzt, nicht mehr Platzhalter
- Logo auf dunklem Cover/CTA in weißer Logo-Kapsel für Lesbarkeit
- keine offiziellen FIFA-/Turnier-Logos
- A4 Hochformat mit `@page` und CSS Page Breaks
- 10 eigenständige Seiten mit Seitennummern
