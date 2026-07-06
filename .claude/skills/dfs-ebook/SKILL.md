---
name: dfs-ebook
description: Use when creating or changing any Deutscher Fenstershop e-book, freebie, Ratgeber-PDF, or lead magnet — including "mach ein E-Book", "neues Freebie", "Ratgeber als PDF", or edits to files under public/ebooks/.
---

# DFS E-Books erstellen

## Kernregel

**E-Book-HTML/CSS wird NIE von Hand geschrieben oder editiert. Immer der Generator.**

Jedes DFS-E-Book entsteht aus einer JSON-Config über `tools/ebook-maker/make-ebook.mjs`. Der Generator erzwingt das kanonische Design (A4, Blau/Orange, Logo, Cover + Inhaltsseiten + CTA) und validiert Inhalte hart gegen das Layout. Handgeschriebenes HTML ist der Grund, warum Seiten früher ungleich aussahen.

## Workflow

1. `tools/ebook-maker/example-ebook.json` kopieren, Inhalte anpassen (alle Felder: siehe `tools/ebook-maker/README.md`).
2. Generieren: `npm run ebook:make -- --config <pfad>.json --out public/ebooks/<slug>`
3. Validierungsfehler? **Inhalte kürzen oder Seiten aufteilen — nie Limits im Generator ändern.** Die Limits sind aus der festen A4-Seitenhöhe abgeleitet.
4. PDF-Export läuft mit und prüft die Seitenzahl (Überlauf = Abbruch). Kein `--no-pdf` für finale Abgabe.
5. Sichtcheck: Cover + eine Inhaltsseite als Screenshot ansehen (headless Chrome `--screenshot`).
6. Veröffentlichung (Freebie-Seite/CMS, Links): erst nach Elvis-Go.

## Block-Referenz

| Block | Regel |
|---|---|
| `cards` | genau 3 Karten (3-Spalten-Raster) |
| `checklist` | 3–8 Punkte |
| `timeline` | genau 3 Schritte |
| `table` | 2–4 Spalten, 1–7 Zeilen |
| `note` / `text` | kurzer Absatz |
| pro Seite | max. 3 Blöcke |

## Mockbild (Buch-Vorschaubild für die Freebie-Seite)

**Wird komplett von Codex generiert — in EINEM Durchgang. Nie Text nachträglich hinzufügen.**

1. Der Generator legt automatisch ab: `assets/cover.png` (echtes Cover als A4-Render) + `mockup-prompt.txt` (fertiger Prompt).
2. Generieren: `codex exec -i public/ebooks/<slug>/assets/cover.png "$(cat public/ebooks/<slug>/mockup-prompt.txt)"`
3. Ablage: `public/ebooks/<slug>/assets/mockup.png` (quadratisch 1024×1024).
4. Sichtcheck: Titeltext im Mockbild muss **buchstabengleich** mit dem Cover sein. Weicht er ab → neu generieren, **nicht** nachbearbeiten.

Verboten: Text-Overlays, Compositing, Badges/Sticker, Canva-Nachbearbeitung, Prompt frei umformulieren. Der Prompt kommt aus dem Generator — Textquelle ist ausschließlich das mitgegebene Cover.

## Inhaltsregeln (nicht automatisierbar — selbst prüfen)

- Keine Preis-, Liefer-, Förder- oder Garantieversprechen.
- Keine geschützten Logos/Visuals (z. B. FIFA/Turniere).
- Deutsch, ruhig, ehrlich — wie der DFS-Chatbot: bei Unsicherheit auf Anfrage/Kontakt verweisen statt behaupten.
- CTA nutzt echte DFS-Kontaktdaten (siehe example-ebook.json), Button-Ziel nur `https://deutscher-fenstershop.de/…`.

## Ausreden-Tabelle

| Ausrede | Realität |
|---|---|
| „Nur diesmal schnell das HTML anpassen" | Genau so entstehen ungleiche Seiten. Config ändern, neu generieren. |
| „Die Limits sind zu streng, ich erhöhe sie" | Limits = A4-Physik. Text kürzen oder Seite aufteilen. |
| „Ich variiere das Design nur leicht" | Konsistenz ist der Zweck des Generators. Design-Änderungen nur in `public/ebooks/ruhiges-heimspiel/styles.css` und nur mit Elvis-Go. |
| „PDF-Check überspringe ich, HTML sah gut aus" | Nur die PDF-Seitenzahl beweist, dass nichts überläuft. |

## Rote Flaggen — sofort stoppen

- Du editierst eine generierte `index.html` direkt.
- Du kopierst `styles.css` und änderst Farben/Abstände.
- Du änderst `LIMITS` oder `HEIGHT_BUDGET_MM` im Generator, um einen Fehler wegzubekommen.
