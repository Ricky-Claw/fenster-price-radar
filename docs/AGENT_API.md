# Agent-Zugang zum Fensterradar & Popup-System (Rückhol-Automatik)

Stand: 2026-07-07 · Für Agents (Claude Code, Cowork, Telegram-Bot, n8n, …), die per HTTP mit dem Radar arbeiten sollen. Menschen nutzen weiter das normale Login — dieser Zugang ist für Maschinen mit Token.

## Überblick

| Fähigkeit | Endpoint | Auth |
|---|---|---|
| Radar-Daten lesen (Preise, EK, Margen, Wochenvergleich) | `GET https://fenster-price-radar.vercel.app/data/price-radar.json` | `Authorization: Bearer $RADAR_AGENT_TOKEN` |
| Preis-Historie lesen | `GET …/data/history/price-radar-YYYY-MM-DD.json` | dito |
| Trend-Index lesen | `GET …/data/price-trend-index.json` | dito |
| Popups auflisten | `GET https://fenster-price-radar.vercel.app/rueckhol/api/campaigns` | `Authorization: Bearer $RUECKHOL_ADMIN_TOKEN` |
| Popup anlegen | `POST …/rueckhol/api/campaigns` (JSON-Body) | dito |
| Popup ändern | `PUT …/rueckhol/api/campaigns` (JSON-Body mit `id`) | dito |
| Popup löschen | `DELETE …/rueckhol/api/campaigns?id=<id>` | dito |
| Popup-Analytics | `GET …/rueckhol/api/analytics` | dito |
| Popup-System Health | `GET …/rueckhol/api/health` | offen |

Beide Zugänge sind **getrennte Tokens** mit getrennten Rechten: Radar-Token ist strikt read-only auf `/data/*` (Middleware lässt nichts anderes durch), Rückhol-Token kann Kampagnen schreiben.

## Einmalige Einrichtung (Betreiber)

1. **Radar-Lese-Token** (Vercel): Token erzeugen (`openssl rand -base64 32`), in Vercel als Env `RADAR_AGENT_TOKEN` (Production) setzen, redeployen. Ohne gesetzte Env ist der Maschinen-Zugang komplett aus (Verhalten wie bisher).
2. **Popup-Admin-Token** (VPS `nexus-host`): Token erzeugen, in `/etc/rueckhol-automatik/service.env` als `ADMIN_TOKEN=<token>` eintragen, dann `systemctl restart rueckhol-automatik`. Der Express-Server akzeptiert dann `Authorization: Bearer <token>` auf allen Dashboard-APIs (Code dafür existiert bereits in `rueckhol-automatik/server/lib/auth.js`).
3. Tokens nur in Env-Stores der Agents ablegen (Codex/Vercel/VPS-Env) — nie in Repos oder Chats.

## Beispiele

```bash
# Aktuelle Radar-Daten (inkl. Einkaufspreise + Margen je Konfiguration)
curl -sS -H "authorization: Bearer $RADAR_AGENT_TOKEN" \
  https://fenster-price-radar.vercel.app/data/price-radar.json | jq '.summary'

# Alle Popups + Sites + Theme-Presets
curl -sS -H "authorization: Bearer $RUECKHOL_ADMIN_TOKEN" \
  https://fenster-price-radar.vercel.app/rueckhol/api/campaigns | jq '.campaigns[].id'

# Popup-Text ändern (PUT ersetzt Felder der bestehenden Kampagne, id Pflicht)
curl -sS -X PUT -H "authorization: Bearer $RUECKHOL_ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"id":"sommer-rabatt","headline":"Nur heute: 10% auf alles"}' \
  https://fenster-price-radar.vercel.app/rueckhol/api/campaigns
```

Kampagnen-Felder: siehe `rueckhol-automatik/server/lib/sanitize.js` (`sanitizeCampaignInput`) — unbekannte Felder werden verworfen, Werte serverseitig bereinigt. `POST` ohne `id` sluggt die `name`-Angabe und vermeidet Site-übergreifende Kollisionen automatisch.

## Datenformat `price-radar.json` (Kurzreferenz)

- `summary` — Zählstände inkl. `purchase` (Eko4u-EK-Lauf) und `weeklyBaselineGeneratedAt`
- `configs[]` — je Konfiguration: `key`, `providers.{dfs,fensterblick,fensterversand,eko4u}`, `purchasePrice`, `purchaseMargin(Pct)`, `bestCompetitor`, `delta(Pct)`, `weeklyChange`, `verification`
- `filtered[]` — aktuell nicht vergleichbare Konfigurationen mit Grund
- Eko4u (`providers.eko4u`) ist Einkaufspreis netto — nie als Wettbewerberpreis interpretieren (`PRICE_RADAR_QUALITY_RULES.md` 1b)

## Sicherheits-Grenzen (bewusst)

- Radar-Token: nur GET auf `/data/*`; App-Seiten, Login, APIs bleiben Cookie-gated. Weekly-Update-Trigger (`/api/trigger-update`) bleibt Menschen/Cron vorbehalten.
- Rückhol-Token: volle Kampagnen-CRUD — Widget-Endpunkte (`config/events/submit`) bleiben öffentlich mit eigenem Origin-/Rate-Limit-Gate.
- Beide Tokens rotierbar durch simples Neusetzen der Env + Neustart/Redeploy.

## Phase 2 (bei Bedarf): MCP-Server

Wenn Agents die Tools als MCP-Connector (claude.ai / Cowork-Registry) brauchen statt roher HTTP-Calls: dünner MCP-Wrapper über genau diese Endpunkte — Vercel Function mit `mcp-handler` (Streamable HTTP), Tools: `radar_get_prices`, `radar_get_history`, `popup_list`, `popup_create`, `popup_update`, `popup_delete`, `popup_analytics`. Auth: gleiche Bearer-Tokens als MCP-Server-Env. Kein neues Rechte-Modell nötig — der Wrapper ruft nur die hier dokumentierte API. Bauen, sobald ein konkreter Agent MCP-only andocken muss.
