# Fensterradar v1

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

- Quelle: `data/comparison-catalog.json` + In-Repo-Provider-Skripte unter `src/providers/{dfs,fensterblick,fensterversand}/`
- Laufdaten: `results/<provider>-mapped-pvc-<timestamp>/results.json` (gitignored)
- Generiert: `public/data/price-radar.json` und `public/data/history/price-radar-YYYY-MM-DD.json`
- Canonical comparison price: Brutto-Listenpreis vor Rabatt
- Shop-Rabatte werden nicht automatisch angewendet
- Ungültige/gerundete Konfigurationen bleiben sichtbar, aber `valid=false`

## So aktualisieren sich die Preise

1. `data/comparison-catalog.json` definiert die zu prüfenden PVC-Konfigurationen.
2. `npm run prices:update` startet die Provider-Skripte für DFS, Fensterblick und Fensterversand. Sie holen Preise aus den Live-Konfigurator-JSON-APIs und schreiben vollständige Läufe nach `results/`.
3. `scripts/sync-results.js` baut daraus `public/data/price-radar.json` und den datierten Snapshot unter `public/data/history/`. Bei unvollständigen Provider-Läufen bricht der Sync ab, bevor Public-Daten veröffentlicht werden.
4. `scripts/verify-price-radar.js` und `scripts/verify-two-sash-equivalence.js` prüfen den Snapshot als Quality-Gate (`npm run verify:prices`).

Der wöchentliche Montagslauf läuft primär als VPS-Cron auf Hostinger `nexus-host`. Die GitHub Action bleibt als manueller Fallback per `workflow_dispatch`. `results/` wird nicht committed; committed werden nur `public/data/price-radar.json` und `public/data/history/*.json`.

## V1 Scope

- Kunststofffenster
- weiß/weiß
- Einzelfenster, Fest / Dreh-Kipp normalisiert
- 2-flg, Stulp, Oberlicht/Unterlicht und Dekorfarben später

## Fenstershop Chatbot MVP

Erster MVP-Slice für den Deutschen Fenstershop:

- API: `POST /api/chatbot`
- Widget: `/chatbot-widget.js`
- Logik: `src/chatbot/fenstershopChatbot.js`
- Wissensbasis/Regeln: `programmierlogik_chatbot_final_mit_anfrage_status.md`

Snippet-Beispiel:

```html
<script
  src="https://YOUR_DEPLOYMENT/chatbot-widget.js"
  data-title="Janela"
  data-api-url="https://YOUR_DEPLOYMENT"
  data-page="/konfigurator/fenster"
></script>
```

`data-page` ist optional — ohne Angabe nutzt das Widget `window.location.pathname`, um Begrüßung und Vorschlags-Chips an die aktuelle Seite anzupassen.

MVP-Regel: harte Kontakt-/Eskalationslogik zuerst, danach lokale Wissenssuche aus dem freigegebenen Regelwerk. Kein Zugriff auf Bestellungen, Tickets, Zahlungen oder Lieferstatus.

Test:

```bash
npm run test:chatbot
```

## Ruhiges Heimspiel E-Book

Das WM-/Fußball-Freebie liegt als statisches HTML/PDF unter:

- Vorschau/Quelle: `public/ebooks/ruhiges-heimspiel/index.html`
- PDF: `public/ebooks/ruhiges-heimspiel/ruhiges-heimspiel-ebook.pdf`
- Logo: `public/ebooks/ruhiges-heimspiel/assets/fenstershop-logo.png`

Lokale Checks:

```bash
npm run ebook:check
npm run ebook:pdf
```
