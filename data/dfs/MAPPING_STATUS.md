# DFS PVC Mapping Status

Stand: 2026-04-27

## Status
- DFS Basispreis-API gefunden und genutzt: `POST /konfigurator/fenster` mit `doprice=1`.
- Profil-/Öffnungs-/Glasdaten kommen aus öffentlichen DFS JSON-Dateien.
- Script: `src/providers/dfs/price-mapped-pvc.js`
- NPM: `npm run dfs:pvc:mapped -- --limit=30`

## Preislogik V1
- Basispreis aus `/konfigurator/fenster` Preisraster.
- Glas-Aufpreis aus `/json/data_window_glass_<profileId>.json`.
- DFS Kalkulation nutzt `window.myPricePercent = 90` und `window.defTax = 19`.
- Vergleichspreis ist Brutto-Listenpreis ohne automatische Rabattlogik.

## V1 Mapping
- Öffnung: Fest und Dreh-Kipp rechts als V1-Normalisierung.
- Glas: 2-fach -> group `1`, 3-fach -> group `2`.
- Farbe: weiß/weiß default; Anthrazit außen später.
- 1-flg Fenster zuerst; 2-flg/Stulp später.

## Letzter Lauf
- Output: `results/dfs-mapped-pvc-2026-04-27T13-13-20-921Z/results.json`
- Full PVC Excel catalog: 63 total.
- Status: 19 priced, 9 invalid/unavailable due size limits, 35 unmatched profiles/types.
- Strict-valid exact-size prices: 13 valid; 6 priced rows were raster-rounded and are marked `comparePrice.valid=false`.

## Hinweise
- DFS rastert manche Maße auf nächsthöhere Rastermaße, z.B. `950x1450 -> 1000x1500`; Script markiert das mit `dimension_rounded_to:*` und setzt `comparePrice.valid=false`.
- Große 1-flg DK Maße können nicht passend sein; später 2-flg/Stulp abbilden.
- Profil-Aliase sind aktuell direkt im Script; später in JSON auslagern.
