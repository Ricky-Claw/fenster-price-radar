# Fensterblick Mapping Status

Scope: PVC Fenster, keine Balkontüren, keine automatische Rabattberechnung.

## Preis-Policy

- Vergleich nutzt `comparePrice.listTotal` = Regulärer Preis / Bruttopreis vor Rabatt.
- Rabatt wird nur als Metadata gespeichert (`observedDiscountPercent`, `discountedTotalObserved`).
- Keine automatische Anwendung im Radar-Core.

## API-Endpunkte

- Initialisierung: `POST https://api.configurator.fensterblick.de/configurations/init-configuration`
- Step-Wechsel: `POST https://api.configurator.fensterblick.de/configurations/process-step-change`
- Maßeingabe/Preisupdate: `POST https://api.configurator.fensterblick.de/configurations/process-input-change`

## Fertig gemappt V1

- Material: PVC/Kunststoff über `selectedIds.material = 10`
- Profile über `selectedIds.profile`, u.a.:
  - Drutex Iglo 5 Classic = `36`
  - Drutex Iglo 5 = `37`
  - Drutex Iglo Light = `49`
  - Drutex Iglo Energy Classic = `38`
  - Drutex Iglo Energy = `40`
  - Drutex Iglo Edge = `328`
  - Aluplast IDEAL Neo AD = `397`
  - Aluplast IDEAL Neo MD = `406`
  - Aluplast IDEAL 4000 Classic-Line = `129`
  - Aluplast IDEAL 8000 Classic-Line = `134`
  - plus Gealan/Schüco/Salamander aliases in `profile-aliases.json`
- Glas per Step `glazing`:
  - 2-fach Verglasung = index `0`, ref `103`
  - 3-fach Verglasung = index `2`, ref `105`
- Öffnung per Step `opening_direction` for 1-Flügel:
  - Fest = index `0`, ref `4490`
  - Dreh-Kipp links = index `5`, ref `3892`
  - Dreh-Kipp rechts = index `6`, ref `3893`
- Farbe V1:
  - Weiß/weiß default.
  - Anthrazit außen basic candidate: `color_outer` index `1`, ref `71346`; exact außen anthrazit / innen weiß still needs UI verification.
- Maße via `inputs.width`, `inputs.height`, `inputs.width_opening_direction`, `inputs.vane_widths.vane_1_width`.

## Script

```bash
npm run fb:pvc:mapped -- --limit=30
```

Output example:

- `/data/.openclaw/workspace/fenstershop-agent/results/fensterblick-mapped-pvc-2026-04-27T12-56-41-167Z/results.json`

## Verification

Default UI/API countercheck:

- UI default shows:
  - Regulärer Preis `73,86 €`
  - Rabatt `19,94 €`
  - Aktionspreis `53,92 €`
- API default returned:
  - `prices.total = 73.85771169375`
  - `discount_percent = 0.27`
  - discounted equivalent ≈ `53.92 €`
- Result: UI and API match for default basis.

Size sanity check for Drutex Iglo 5 Classic / 2fach / weiß / Dreh-Kipp links:

- 600x600 → `171.85 €`
- 800x1000 → `236.86 €`
- 950x1450 → `333.66 €`
- 1000x1600 → `349.45 €`
- 1200x1800 → `437.63 €`

Prices increase plausibly with valid dimensions.

## Important caveats

- Fensterblick silently clamps invalid dimensions to allowed min/max. Script now marks `comparePrice.valid=false` and adds warning `dimension_adjusted_by_configurator:<actual>` when UI/API returns dimensions different from requested.
- Large single-sash sizes like 1000x2100 or 2000x2000 with 1-flg DK are invalid and get clamped; later use 2-flg/Stulp or other fenster type mapping.
- V1 safe scope: valid single-window PVC configs, white/white, 2fach/3fach, Fest or Dreh-Kipp.
