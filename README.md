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

Attribute am Script-Tag:

| Attribut | Bedeutung | Default |
|---|---|---|
| `data-api-url` | Basis-URL der Chatbot-API | Origin des Script-Tags |
| `data-title` | Titel im Widget-Kopf | `Janela` |
| `data-accent` | Akzentfarbe (Hex) | `#004b93` |
| `data-page` | Erzwingt Seitenkontext für Begrüßung/Chips | `window.location.pathname` |

Das Widget ist ein reines Single-File-Script ohne Abhängigkeiten. Ist die API nicht erreichbar, zeigt es eine Kontakt-Antwort statt eines Fehlers — die Kundenseite bricht nie.

Serverseitig vor Produktivbetrieb auf einer fremden Domain: `CHATBOT_ALLOW_ORIGIN` auf die Shop-Domain setzen (Default ist `*`). Direktzugriff ohne Widget: `POST /api/chatbot` mit `{"message": "...", "page": "..."}` → `{"answer": ...}` (Rate-Limit pro IP).

**Firmenwissen pflegen ohne Code:** Markdown-Dateien unter `knowledge/` direkt in GitHub bearbeiten → automatischer Deploy, der Bot kennt den neuen Stand nach wenigen Minuten. Anleitung: `public/janela-wissen-anleitung.md`. Gecrawltes Website-Wissen aktualisieren: `npm run knowledge:crawl`.

MVP-Regel: harte Kontakt-/Eskalationslogik zuerst, danach lokale Wissenssuche aus dem freigegebenen Regelwerk. Kein Zugriff auf Bestellungen, Tickets, Zahlungen oder Lieferstatus.

LLM-Polierung: primär NVIDIA Nemotron (`NVIDIA_API_KEY`, Modell via `FENSTERSHOP_NEMOTRON_MODEL`), Fallback Kimi/Moonshot (`KIMI_API_KEY`). Ohne Keys bleibt die reine Regelantwort bestehen.

Test:

```bash
npm run test:chatbot
```

## Sprachaufmaß (Voice-Konfigurator) — Integration

Eigenständige Seite unter `/aufmass.html` — vom Shop aus **verlinken** (Button/Menüpunkt). Bewusst nicht per iframe einbettbar (CSP `frame-ancestors 'none'`).

Fertige Aufmaße werden an die Env-Variable `AUFMASS_TICKET_WEBHOOK` (Ziel-URL eures CMS/Ticketsystems) weitergeleitet. Die Empfängerseite bekommt ein POST (JSON, 6-Sekunden-Timeout, HTTP 2xx = übernommen):

```json
{
  "reference": "AUF-20260711-a1b2c3d4",
  "submittedAt": "2026-07-11T12:00:00.000Z",
  "windowCount": 2,
  "note": "Anmerkung des Kunden",
  "windows": [
    {
      "raum": "Wohnzimmer", "anzahl": 1,
      "breiteMm": 1200, "hoeheMm": 1400,
      "oeffnungsart": "Dreh-Kipp", "anschlag": "links",
      "material": "Kunststoff", "verglasung": "3-fach",
      "farbe": "weiß", "notiz": ""
    }
  ]
}
```

Ob der Webhook aktiv ist, zeigt `GET /api/aufmass-submit` (`configured: true/false`). Ohne Webhook läuft die Seite im Testphase-Modus (nichts wird versendet). Weitere Env-Variablen (KI-Keys, CORS via `AUFMASS_ALLOW_ORIGIN`, Rate-Limits): `docs/aufmass-sprachkonfigurator.md`.

## Rückholautomatik (Exit-Intent-Popups) — Integration

Ein Script-Tag auf der Kundenseite, der Server läuft separat:

```html
<script async src="https://rueckhol.schwarzwald-agent.de/cre.js"
        data-cre-site="<siteId>"
        data-cre-api="https://rueckhol.schwarzwald-agent.de"></script>
```

Voraussetzungen: `siteId` muss zu einer aktiven Kampagne passen und die Seiten-Domain muss serverseitig in `SITE_ORIGINS` freigeschaltet sein. Fehlersuche: `data-cre-debug="1"` ans Tag. Vollständige Doku (Env, API, Betrieb): `rueckhol-automatik/README.md`.

## Maschinenzugang für Agents/Automationen

Preisdaten, Popup-CRUD und Chatbot sind auch per Token-API/MCP erreichbar — Endpunkte, Auth und Beispiele in `docs/AGENT_API.md`.

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
