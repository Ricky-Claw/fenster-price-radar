# Rückhol-Automatik (Conversion Rescue) — v1.0

> **Dies ist die einzige kanonische Quelle dieses Produkts.**
> Das alte Standalone-Repo `~/conversion-rescue` ist eingefroren (DEPRECATED) und
> Desktop-Handoff-Kopien wurden entfernt. Änderungen passieren nur noch hier.
> Version: siehe `package.json` / `GET /api/health` / Kopf von `widget/cre.js` — bei
> Änderungen alle drei pflegen und `CHANGELOG.md` ergänzen.

Exit-Intent/Rückhol-Popup-System: erscheint, wenn ein Besucher die Seite verlassen
will (oder nach Zeit/Scroll/Inaktivität), und bietet Newsletter, Kontakt, Rabattcode,
Link oder PDF an. Eigenständiger Express-Server + SQLite, kein Framework-Zwang auf
der Kundenseite — Einbau ist ein `<script>`-Tag.

**Abgrenzung:** `src/frontend/lib/cre/*` im Schwarzwald-Agent-Repo ist ein ANDERES
Produkt (Supabase-CRE fürs Kunden-Cockpit, live für DFS) — kein Duplikat, nicht anfassen.

---

## Live-Zustand (Testphase)

| Was | Wo |
|---|---|
| Server | VPS `nexus-host` (76.13.143.100), systemd-Dienst `rueckhol-automatik`, Port 8791 (nur localhost) |
| Direkt-Domain | https://rueckhol.schwarzwald-agent.de (Caddy, Auto-TLS) |
| Kunden-URL | https://fenster-price-radar.vercel.app/rueckhol/* (Vercel-Proxy-Rewrite in `../vercel.json`) |
| Dashboard | `/dashboard/` — Passwort = `FENSTER_RADAR_PASSWORD` |
| Test-Shop | `/demo/demo-test.html` — simulierter Online-Shop (NORDMÖBEL-Kulisse); Popups feuern echt wie beim Besucher, Test-Panel unten rechts triggert gezielt, speist echte Analytics (Seite `demo`) |
| Galerie | `/demo/alle-popups.html` — alle Popup-Typen als Vorschau (blau/orange Beispiel-Farben) |
| Health | `/api/health` → `{ok, name, version, uptimeSeconds}` |
| Service-Env | `/etc/rueckhol-automatik/service.env` auf der VPS |

Der Fensterradar-`middleware.js` nimmt `/rueckhol/*` vom seitenweiten Passwort-Gate aus
(die App hat ihr eigenes Login); der Vercel-Proxy erzwingt `no-store` auf `/rueckhol/*`.

## Lokal entwickeln

```bash
npm run rueckhol         # aus dem Fensterradar-Repo-Root — Server auf :8080
npm run rueckhol:test    # 12 Tests (node --test)
```

Oder in diesem Ordner: `npm install && npm start` / `npm test`. `better-sqlite3` und
`express` sind Node-Stdlib-Shims unter `vendor/` — kein echter Download nötig.
Ohne gesetztes Passwort läuft alles offen (Dev-Modus, Warnung im Log).

## Env-Variablen

| Variable | Zweck | Default |
|---|---|---|
| `PORT` | Server-Port | `8080` |
| `FENSTER_RADAR_PASSWORD` | Dashboard-Login-Passwort. **Ungesetzt = Dashboard offen (nur Dev!)** | leer |
| `FENSTER_RADAR_AUTH_SECRET` | HMAC-Secret für Session-Cookies (Fallback: das Passwort) | leer |
| `ADMIN_TOKEN` | Alternativ/zusätzlich: Bearer-Token für API-Zugriff ohne Cookie (Skripte/Seeding) | leer |
| `SITE_ORIGINS` | JSON `{"siteId":["https://origin",…]}` — CORS-Allowlist der Widget-Endpunkte. **Ungesetzt = allow-all (nur Test!)** | leer |
| `WEBHOOK_URL` | Bekommt POST bei jeder Lead-Submission — **der Weg, wie Leads den Kunden erreichen** | leer |
| `DISABLE_DEMO` | `1` = `/demo/*` wird nicht ausgeliefert (Kunden-Produktivbetrieb) | aus |

## API

Öffentlich (CORS über `SITE_ORIGINS`; Preflight akzeptiert jede dort gelistete Origin.
Ehrlich gesagt: CORS steuert nur, welche BROWSER-Seiten Antworten lesen dürfen — blinde
Schreib-POSTs von Skripten verhindert es nicht; Rate-Limit + Validierung deckeln das,
eine echte Schreib-Autorisierung wäre v2):
- `GET /api/config?siteId=X` — aktive Kampagnen fürs Widget
- `POST /api/events` — Tracking (siteId im Body; Rate-Limit pro IP)
- `POST /api/submit` — Lead-Formulare (erzwingt Consent + valide E-Mail; feuert Webhook)
- `GET /cre.js` — Embed-Script (Cache 5 Min)
- `GET /api/health` — Monitoring/Version

Login (eigenes Cookie `rueckhol_session`, HMAC-signiert, 24 h):
- `GET /login` — Login-Seite · `POST /api/login` · `POST /api/logout`

Geschützt (Session-Cookie ODER `Authorization: Bearer <ADMIN_TOKEN>`):
- `GET/POST/PUT/DELETE /api/campaigns` — Kampagnen-CRUD (POST vergibt bei
  Namens-Kollision über Site-Grenzen automatisch eine eindeutige ID)
- `GET /api/analytics?siteId=X` — Funnel (allTime + last7Days)
- `/dashboard/` — UI (nicht eingeloggte Aufrufe → Redirect auf `/login`)

## Einbau auf einer Kundenseite

```html
<script async src="https://<host>/cre.js" data-cre-site="<siteId>" data-cre-api="https://<host>"></script>
```

- `siteId` muss zu den Kampagnen (Feld „Seiten-Kennung") und zum `SITE_ORIGINS`-Eintrag passen.
- Fehlersuche: `data-cre-debug="1"` ans Tag → das Widget loggt in der Browser-Konsole,
  warum kein Popup erscheint (Server nicht erreichbar / CORS / keine aktive Kampagne).
- Der Server darf tot sein — das Widget schluckt alle Fehler, die Kundenseite bricht nie.

## Betrieb & Update (VPS)

```bash
# Deploy/Update vom kanonischen Stand (data/ NIE mitkopieren — dort lebt die Kunden-DB):
rsync -az --delete --exclude='.git' --exclude='node_modules' --exclude='data' --exclude='.DS_Store' \
  ./ root@76.13.143.100:/opt/rueckhol-automatik/
ssh root@76.13.143.100 'chown -R fensterradar:fensterradar /opt/rueckhol-automatik \
  && sudo -u fensterradar bash -c "cd /opt/rueckhol-automatik && npm install --no-audit --no-fund && npm test" \
  && systemctl restart rueckhol-automatik'
curl -s https://rueckhol.schwarzwald-agent.de/api/health   # muss ok:true + neue Version zeigen
```

- Die SQLite-DB liegt in `data/` (gitignored, rsync-excluded) — sie überlebt jedes Code-Update.
- Schema-Änderungen: aktuell nur additiv per `CREATE TABLE IF NOT EXISTS` — es gibt
  **keinen Migrationsmechanismus**. Neue Spalten brauchen einen bewussten Migrationsschritt
  (dokumentieren, bevor 1.x eine Spalte ändert!).
- Monitoring: `GET /api/health` extern anpingen (z.B. Uptime-Robot auf die Direkt-Domain).

## Multi-Kunde / Vermarktung (v1-Modell)

**Eine Instanz pro Kunde.** Das Dashboard hat EIN Passwort und zeigt ALLE Sites einer
Instanz — es gibt keine Benutzerkonten/Mandanten-Trennung innerhalb einer Instanz.
Deshalb: pro zahlendem Kunden ein eigener Dienst (eigener Port + eigene `service.env`
+ eigene SQLite in eigenem Ordner + eigener Caddy-Vhost). Die `siteId`-Mechanik dient
INNERHALB eines Kunden zur Trennung mehrerer Webseiten desselben Kunden.
Aufwand pro weiterer Instanz: Ordner kopieren (ohne `data/`), Env-Datei, systemd-Unit,
Caddy-Block, DNS — ~15 Minuten. Echte Mandantenfähigkeit in einer Instanz wäre v2.

## Struktur

- `server/index.js` — Express-App, alle Routen
- `server/lib/auth.js` — Passwort-Login, Session-Cookies, Dashboard-Guards
- `server/lib/sanitize.js` — Input-Cleaning (Text/URLs/Trigger/Action, Consent+E-Mail-Pflicht)
- `server/lib/theme.js` — Design-Presets + Theme-Normalisierung
- `server/lib/analytics.js` — Funnel-Auswertung
- `server/db.js` — SQLite-Schema + Queries (`data/conversion-rescue.sqlite`)
- `widget/cre.js` — Embed-Widget (Shadow DOM, Trigger, Consent, Frequency-Cap, Debug-Modus)
- `dashboard/` — Kampagnen-Editor mit Live-Vorschau + Auswertung (mobil-tauglich)
- `demo/demo-test.html` — Test-Shop (simulierter E-Commerce, Popups feuern live) · `demo/alle-popups.html` — Typen-Galerie
- `tests/` — 12 Tests: API/CRUD, Preflight-Regression, Auth-Flow, Slug-Kollision, Sanitize, Analytics

## Offene Punkte (bewusst, Stand v1.0)

- **Leads erreichen den Kunden nur über `WEBHOOK_URL`** (kein Posteingang im Dashboard,
  kein Export). Vor echtem Kundenbetrieb: Webhook auf CRM/Zapier/Mail-Bridge zeigen lassen.
- Kein DB-Backup-Cron auf der VPS (eine Datei, `data/conversion-rescue.sqlite`).
- Kein Rate-Limit auf `/api/login` (Events haben eins).
- DSGVO-Werkzeuge (Löschung/Export/Aufbewahrung) fehlen — Integrator-/v2-Thema.
- Finales Popup-Design macht der Webdesigner des Kunden (Beispiel-Themes blau/orange).
