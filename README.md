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
  data-title="Fenstershop Hilfe"
  data-api-url="https://YOUR_DEPLOYMENT"
></script>
```

MVP-Regel: harte Kontakt-/Eskalationslogik zuerst, danach lokale Wissenssuche aus dem freigegebenen Regelwerk. Kein Zugriff auf Bestellungen, Tickets, Zahlungen oder Lieferstatus.

Test:

```bash
npm run test:chatbot
```
