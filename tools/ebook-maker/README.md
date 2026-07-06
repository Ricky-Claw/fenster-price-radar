# DFS E-Book Maker

Interner Generator für DFS-Freebie-/Ratgeber-PDFs im bestehenden „Ruhiges Heimspiel“-Look.

## Zweck

- aus einer JSON-Struktur ein A4-HTML-E-Book erzeugen
- vorhandenes DFS-Design nutzen: Logo, Blau/Orange, Karten, CTA, Print-Layout
- optional direkt als PDF exportieren
- keine CMS- oder Live-Änderung: Output entsteht lokal oder in einem angegebenen Zielordner

## Schnelltest

```bash
node tools/ebook-maker/make-ebook.mjs --config tools/ebook-maker/example-ebook.json --out /tmp/dfs-ebook-maker-test --no-pdf
```

Mit PDF-Export:

```bash
node tools/ebook-maker/make-ebook.mjs --config tools/ebook-maker/example-ebook.json --out /tmp/dfs-ebook-maker-test
```

## Neues Freebie vorbereiten

1. `example-ebook.json` kopieren und Inhalte anpassen.
2. Zielordner wählen, z. B. `public/ebooks/<slug>`.
3. Generator laufen lassen.
4. Ergebnis lokal prüfen.
5. Erst nach Elvis-Go: CMS-/Freebie-Seite mit Vorschaubild und PDF-Link aktualisieren.

## JSON-Felder

- `title`: E-Book-Titel
- `subtitle`: Unterzeile auf dem Cover
- `kicker`: kleine Zeile über dem Titel
- `claim`: kurzer Nutzen-Satz
- `topics`: Themen-Pills auf dem Cover
- `cta`: optionaler Abschlussblock mit Button und Kontaktinfos
- `pages`: Seitenliste nach dem Cover
  - `label`
  - `title`
  - `lead`
  - `blocks`: `cards`, `checklist`, `timeline`, `note`, `table`, `text`

## Validierung

Der Generator prüft die Config hart und bricht mit klaren Fehlermeldungen ab (Exit 1), bevor ein unsauberes E-Book entsteht:

- Pflichtfelder (`slug`, `title`, `subtitle`, `claim`, je Seite `label`/`title`/`lead`)
- Längen-Limits pro Feld und Block (abgeleitet aus dem A4-Layout in `styles.css`)
- Block-Regeln: `cards` genau 3, `checklist` 3–8, `timeline` genau 3, `table` 2–4 Spalten / max. 7 Zeilen, max. 3 Blöcke pro Seite
- Höhen-Budget pro Seite (~235mm) gegen Überlauf
- unbekannte Block-Typen sind Fehler
- PDF-Export prüft die Seitenzahl: mehr PDF-Seiten als `pages + 2` = Überlauf = Abbruch

**Bei Validierungsfehlern: Inhalte kürzen oder Seiten aufteilen — nie die Limits im Generator ändern.**

Regeln für Agenten: siehe `.claude/skills/dfs-ebook/SKILL.md`.

## Sicherheit

- keine offiziellen FIFA-/Turnier-Logos oder geschützten Visuals nutzen
- keine Preis-, Liefer-, Förder- oder Garantieversprechen einbauen
- PDF-Link und Buch-Vorschaubild im CMS erst nach Freigabe ersetzen
