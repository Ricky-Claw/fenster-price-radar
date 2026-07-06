# Changelog — Rückhol-Automatik

Format: eine Sektion pro Version, neueste oben. Version auch in `package.json`
und im Kopf-Kommentar von `widget/cre.js` pflegen (abfragbar via `GET /api/health`).

## 1.0.0 — 2026-07-06

Erste auslieferbare Version (Testphase beim Kunden).

**Kritische Fixes**
- Auto-Trigger repariert: das Standard-Seitenmuster `*` („alle Seiten") wurde im
  Widget als URL-Substring gesucht und matchte nie — Exit-Intent/Zeit/Scroll-Popups
  konnten für jede mit Standardeinstellungen angelegte Kampagne niemals automatisch
  feuern. Jetzt gilt `*` als „überall".
- CORS-Preflight repariert: sobald die Origin-Allowlist (`SITE_ORIGINS`) gesetzt ist,
  blockierte der Browser alle Tracking-Events und Lead-Formulare (Preflight trägt die
  siteId nicht in der URL, der Server suchte sie aber dort). Preflight erlaubt jetzt
  jede in irgendeiner Site konfigurierte Origin. (Hinweis: CORS steuert Antwort-
  Sichtbarkeit im Browser, keine Schreib-Autorisierung — blinde POSTs von Skripten
  bleiben möglich, gedeckelt durch Rate-Limit + Validierung.)
- Kampagne bearbeiten + speichern (PUT) warf immer HTTP 500 (`Unknown named
  parameter 'created_at'`) — der Kern-Workflow „bestehendes Popup anpassen" war
  komplett kaputt. Gefixt + Regressionstest.
- Updates per API in camelCase-Schreibweise (`actionConfig` statt `action_config`)
  wurden still verworfen — der gespeicherte Alt-Wert gewann den Merge. Aliase
  werden jetzt vor dem Merge normalisiert.
- `/api/submit` jetzt rate-limitiert wie `/api/events` (war der ungebremste
  Webhook-Spam-Pfad).

**Neu**
- `GET /api/health` — Status, Version, Uptime (für Monitoring + „welche Version läuft beim Kunden?").
- Passwort-Login fürs Dashboard (`/login`, Session-Cookie, HMAC-signiert); Widget-Endpunkte bleiben öffentlich.
- Mobil-Optimierung des Dashboards (bedienbar auf dem Handy).
- Demo-Testseite `demo/demo-test.html` (Popups feuern echt, speisen echte Analytics).
- `data-cre-debug="1"` am Embed-Snippet: Widget erklärt in der Konsole, warum kein Popup erscheint.
- `DISABLE_DEMO=1` blendet die Demo-Seiten in Kundeninstallationen aus.
- Kampagnen-IDs kollidieren nicht mehr über Site-Grenzen (gleicher Name auf zwei Sites überschrieb sich still).
- `cre.js` mit 5-Minuten-Cache (Widget-Updates erreichen Kundenseiten ohne Cache-Busting).

**Bekannte, bewusste Grenzen (Testphase / Integrator-Aufgaben)**
- Kein Lead-Posteingang im Dashboard — Leads erreichen den Kunden über `WEBHOOK_URL`.
- Ein Dashboard-Passwort pro Instanz (keine Benutzerkonten) → **eine Instanz pro Kunde** betreiben.
- Kein automatisches DB-Backup, keine Schema-Migrationen (Update = Code ersetzen, `data/` bleibt liegen).
- Analytics-Eventspeicher global auf 5000 Events gedeckelt (pro Instanz, nicht pro Site).
- Kein Rate-Limit auf `/api/login` (Dashboard-Login); Events/Submits sind limitiert.
