---
name: dfs-kampagnen-design
description: Use when creating a complete ad-creative package for a Deutscher Fenstershop campaign — Google-Display-Banner, Instagram-Karussells und Stories als KI-generierte Premium-Designs via Codex ("mach die Werbebanner/Kampagnen-Bilder für Aktion X"). NOT for the deterministic HTML banner generator (that is skill dfs-banner).
---

# DFS Kampagnen-Design — Codex-Bildpipeline (Playbook der Förderheld-Kampagne 07/2026)

## Kernregeln (hart erarbeitet, nicht verhandelbar)

1. **Voll-Generierung, nie Komposition.** Jedes Motiv wird KOMPLETT vom Codex-Bildtool generiert (inkl. aller Texte im Bild). Programmatisch gezeichnete Flächen/Layouts (sharp/SVG-artig) erzeugen den „Flat-/SVG-Look", den Elvis explizit ablehnt. sharp ist NUR erlaubt für: exakten Größen-Crop + Logo-Composite.
2. **Stil-Anker Pflicht.** Bei jeder Generierung/Änderung ein Referenzbild angeben („sieh dir <datei> an — exakt dieser Look"). Kleine Textänderung = trotzdem Voll-Regeneration mit Anker, nie ins Bild hineineditieren.
3. **Logo IMMER als Composite, nie KI-malen lassen** (KI-Logos variieren pro Bild → Inkonsistenz-Beschwerde). Im generierten Bild eine LEERE dunkle Logo-Zone einplanen — nie einen weißen Kasten und **keinerlei sichtbare Markierung** (kein Rahmen, kein gestrichelter Platzhalter — Codex malt sonst die „Zone" als orange-gestricheltes Rechteck ins Motiv, passiert 20.07. bei Story-Format; im Prompt formulieren: „ruhiger ungestörter Hintergrund, dort wird später das Logo montiert"). Danach montieren:
   - Dunkler Grund: `tools/banner-maker/out/_logo-weiss.png` (weiße „DEUTSCHER-"-Zeile, orange „FENSTERSHOP.DE") — Elvis' Standard.
   - Helle Panels (Foto-Stil): Original `src/Logo-Freigestellt.png`.
   - lanczos3 direkt vom Asset; NIE über ein bereits eingebranntes Logo legen (Doppel-Logo!) — ohne saubere Roh-Basis aus dem Codex-Cache: neu generieren.
   - Je Serie identische Größe/Position (Karussell 1080²: Breite ~280px, oben links 64/56px; Story: Breite ~340px, zentriert, y≈310px).
4. **Sichtprüfung jedes Bilds** (Read): Textfehler, Clipping an Kanten (häufigster Fehler bei Thin-Formaten!), Logo-Überlappung, Doppel-Logo, keine Maßzahlen in Blueprint-Grafiken (widersprüchliche Zahlen = Beschwerde). Maschinen-Gate je Datei: `tools/banner-maker/image-meta.mjs` → exakte Maße, echtes JPEG, Google-Banner ≤150 KB.

## Design-System
- **Blaupausen-Stil (dunkel, Standard):** #0C2D57, fotorealistisch-atmosphärisches Blueprint-Haus mit orangem Fensterglühen, Tiefe/Vignette. Weiß = Text, Orange #F47B20 NUR Störer/CTA/Haken.
- **Foto-Stil (hell):** fotorealistische Wohnszene, Fenster im Fokus, weiches weißes Panel, Text Dunkelblau.
- Kein BAFA-Wort auf Werbemitteln, keine Garantie-Sprache, Zuschuss konservativ „bis zu 15 %" (Beispiel 20.000 € → bis zu 3.000 €), Mechanik „Erst Antrag, dann bestellen" nie verletzen. Details: `docs/kampagne-foerderheld-bafa.md`.

## Format-Sets
- **Google Ads (11, je ≤150 KB):** 300x250, 336x280, 970x250, 728x90, 468x60, 300x600, 160x600, 120x600, 320x480, 320x100, 320x50. (Werbeteam-Best-Performer: 120x600, 160x600, 300x250, 468x60, 728x90, 970x250, 320x50, 320x480.)
- **Thin-Formate (728x90, 468x60, 320x50):** strikte Zonen links→rechts [Logo-Zone leer | Text | CTA vollständig + 10px Rand] im Prompt vorgeben; im breitesten Verhältnis generieren + extract-Crop; mehrere Versuche einplanen.
- **IG-Karussell:** 1080x1080, Serie mit gleichem Haus/gleicher Welt, Slide-Punkte (aktive Position!) + „Wischen →" außer letzter Slide, CTA-Element auf JEDER Slide. Fenster-Produktfokus — wir verkaufen Fenster, Förderung ist Feature.
- **IG-Story:** 1080x1920, Safe-Areas oben ~250px/unten ~300px, CTA-Button + „Hochwischen".

## Auslieferung
- Arbeitsdateien: `tools/banner-maker/out/<aktion>-final/` + `.../foerderheld-instagram/`-Muster (gitignored).
- **Öffentliche Download-Seite** (Agentur-tauglich, echte Downloads): VPS nexus-host `/var/www/<aktion>-assets/` hinter Caddy `handle_path /assets/<aktion>/*` auf `srv1332950.hstgr.cloud` (Muster im Caddyfile; Backup + validate + graceful reload; VPS-Schreiben braucht Elvis-Go). Sprechende Dateinamen `dfs-<aktion>-google-300x250.jpg` etc. + `...-alle-assets.zip`. index.html-Galerie-Muster: Scratchpad-Builder der Förderheld-Session.
- **Claude-Artifact-Galerie** zur Ansicht: Republish desselben Dateipfads = gleiche URL (verschickte Links bleiben gültig). Download-Buttons in Artifacts funktionieren NICHT (Sandbox) → immer auf die VPS-Seite verlinken. Extern-Seite: keine internen Infos (keine Pfade, offenen Punkte, Prozess-Notizen).

## Feedback-Loop
Kundenänderung → betroffene Dateien identifizieren → Voll-Regeneration mit Stil-Anker (Regel 1) → Sichtprüfung → VPS-Dateien + ZIP + Artifact aktualisieren (Links unverändert). Gute Versionen liegen auf dem VPS = Restore-Quelle, wenn eine Änderungsrunde verschlimmbessert.

## Rote Flaggen
| Ausrede | Realität |
|---|---|
| „Kleine Änderung, ich komponiere das schnell per sharp" | Nein — SVG-Look-Beschwerde garantiert. Voll-Regeneration. |
| „Logo einfach drüberlegen" | Nein — Doppel-Logo. Saubere Basis oder neu generieren. |
| „Kastenförmiger weißer Logo-Hintergrund" | Nein — Elvis will weiße Logo-Variante bzw. Kontur, nie Kasten. |
| „Bemaßungszahlen machen's technischer" | Nein — KI-Zahlen widersprechen sich. Linien ohne Zahlen. |
| „Download-Button im Artifact reicht" | Nein — Sandbox blockt. VPS-Seite ist der Download-Kanal. |
