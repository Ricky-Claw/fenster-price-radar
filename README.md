# Fenster Price Radar

Interne DFS-Anwendung zum Vergleich eigener Brutto-Listenpreise gegen Fensterblick und Fensterversand.

## Start

```bash
npm install
npm run data:sync
npm run dev
```

## Build

```bash
npm run build
```

## Datenmodell

- Quelle: `../fenstershop-agent/results/*/results.json`
- Generiert: `public/data/price-radar.json`
- Canonical comparison price: Brutto-Listenpreis vor Rabatt
- Shop-Rabatte werden nicht automatisch angewendet
- Ungültige/gerundete Konfigurationen bleiben sichtbar, aber `valid=false`

## V1 Scope

- Kunststofffenster
- weiß/weiß
- Einzelfenster, Fest / Dreh-Kipp normalisiert
- 2-flg, Stulp, Oberlicht/Unterlicht und Dekorfarben später
