---
name: dfs-banner
description: Use when creating or changing Deutscher Fenstershop Werbebanner / Display-Ads / Kampagnen-Banner — including "mach Banner für Aktion X", Google-Ads-Banner, Bannerkampagne, oder Änderungen unter tools/banner-maker/.
---

# DFS-Werbebanner erstellen

## Kernregel

**Banner NIE von Hand oder als SVG-Composite bauen — immer den Generator nutzen.**

Der Kunde verlangt echte Rasterbilder. Die alten SVG-Skripte unter `campaigns/` wurden genau deshalb abgelöst.

## Befehle

```bash
npm run banner:make -- --aktion <id>
npm run banner:make -- --config <adhoc.json>
npm run banner:make -- --size <filter>
npm run banner:make -- --motiv <datei>
npm run test:banner
npm run banner:check
```

## Daten und Motive

- `src/actionCalendar.js` wählt Aktionen nach Datum automatisch.
- Für Aktionen außerhalb des Kalenders den Ad-hoc-Modus verwenden. Der Wording-Guard bricht bei FIFA/Turnier, „auf alles", Garantie-Versprechen und Förder-Zusagen ab.
- Google-Größen stehen ausschließlich in `tools/banner-maker/sizes.json`. Elvis' finale Liste ersetzt dort den Seed.
- KI-Motive unter `tools/banner-maker/motive/<aktion-id>/` ablegen (gitignored); Konvention: `tools/banner-maker/motive/README.md`. Ohne Motiv greift das Design-Fallback.

## Harte Gates

- Exakte Pixelmaße
- Höchstens 150 KB pro Datei
- Echtes PNG oder JPEG, nie SVG

Generator und `npm run test:banner` verifizieren diese Gates.

## Sicherheit

`tools/banner-maker/out/` ist gitignored und darf **nie** nach `public/` kopiert werden: Dateien unter `public/` sind durch die Middleware login-frei öffentlich. Upload zu Google Ads erst nach Elvis-Go.

## Rote Flaggen

| Ausrede | Realität |
|---|---|
| „Nur schnell ein Banner von Hand" | Nein: Generator verwenden. |
| „SVG reicht doch" | Nein: Der Kunde verlangt Rasterbilder. |
| „Limits im Generator lockern" | Nein: Copy kürzen oder Motiv beruhigen. |
