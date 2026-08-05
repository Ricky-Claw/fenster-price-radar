# Rückhol-Automatik (Conversion Rescue) — v1.2.0

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

## Hosting-Modell

Der Server ist eigenständig und läuft auf jedem Node-Host. Zielbild für den
Kundenbetrieb: **eigene Subdomain des Kunden** (z. B. `rueckhol.<kunden-domain>`),
eine Instanz pro Kunde (siehe „Multi-Kunde" unten). Die Tabelle unten zeigt das
**aktuelle Pilot-Hosting** — es ist jederzeit umziehbar (Ordner + Env + DNS),
danach nur die Snippet-URLs auf der Kundenseite anpassen.

## Live-Zustand (Pilot-Hosting, Testphase)

| Was | Wo |
|---|---|
| Server | VPS `<VPS-IP>`, systemd-Dienst `rueckhol-automatik`, Port 8791 (nur localhost) |
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
npm run rueckhol:test    # 34 Tests (Node Test Runner)
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
| `WEBHOOK_URL` | Push-Kanal: bekommt POST bei jeder Lead-Submission; Pull-Zugriff zusätzlich im Dashboard-Leads-Tab und per CSV-Export | leer |
| `TRUST_PROXY_HEADERS` | `1` = nach fehlendem `X-Forwarded-For` auch `X-Real-IP` bzw. `X-Vercel-Forwarded-For` vertrauen. Nur setzen, wenn ein eigener Proxy diese Header bereinigt. | aus (sicher) |
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
- `GET /api/submissions?site=X[&format=csv]` — Leads als JSON oder CSV-Export
- `/dashboard/` — UI (nicht eingeloggte Aufrufe → Redirect auf `/login`)
- `GET /api/install-check?siteId=X` — geschützte Einbauprüfung: ruft ausschließlich
  die für `X` in `SITE_ORIGINS` hinterlegten HTTPS-Domains ab und sucht dort nach dem
  passenden `cre.js`-Script. Nutzer-URLs werden niemals verwendet.

### MCP-Zugang für Agenten

Der MCP-Endpunkt läuft direkt auf diesem Server: `POST https://<host>/api/mcp`.
Authentifizierung erfolgt mit `Authorization: Bearer <ADMIN_TOKEN>`; verwendet
wird ein eigenständiges, langes zufälliges `ADMIN_TOKEN`, unabhängig vom
Dashboard-Passwort. Verfügbare Werkzeuge sind
`popup_list`, `popup_analytics`, `popup_create`, `popup_update`, `popup_design`
und `popup_delete`. Ohne konfiguriertes `ADMIN_TOKEN` bleibt der MCP-Endpunkt
aus Sicherheitsgründen geschlossen.

## Einbau auf einer Kundenseite

```html
<script async src="https://<host>/cre.js" data-cre-site="<siteId>" data-cre-api="https://<host>"></script>
```

- `siteId` muss zu den Kampagnen (Feld „Seiten-Kennung") und zum `SITE_ORIGINS`-Eintrag passen.
- Fehlersuche: `data-cre-debug="1"` ans Tag → das Widget loggt in der Browser-Konsole,
  warum kein Popup erscheint (Server nicht erreichbar / CORS / keine aktive Kampagne).
- Der Server darf tot sein — das Widget schluckt alle Fehler, die Kundenseite bricht nie.
- `CRE.trigger(id)` respektiert Kampagnen- und Seiten-Deckel; `CRE.triggerTest(id)` umgeht beide ausschließlich für Vorschau-/Testknöpfe. Der 6h-Seiten-Deckel sperrt andere Kampagnen, nicht die zuletzt gezeigte Kampagne mit ihrer eigenen kürzeren Wiederholungszeit.

### Einbau ins Kunden-CMS (für den Webdesigner)

1. Dieses Script **einmal im globalen Layout/Footer** einbauen, damit es auch auf
   Produktseiten, Warenkorb und Kasse geladen wird:

   ```html
   <script async src="https://rueckhol.<kunden-domain>/cre.js" data-cre-site="<siteId>"></script>
   ```

2. Falls das globale Template nicht bearbeitet werden kann: denselben Code im Google
   Tag Manager als Custom-HTML-Tag mit Trigger **„All Pages"** einbauen. Nicht nur in
   einzelne CMS-Inhaltsseiten einsetzen.
3. Bei vorhandener Content-Security-Policy die Rückhol-Subdomain unter `script-src`
   und `connect-src` erlauben.
4. Auf Staging und anschließend live prüfen: Desktop + Mobil, Produktseite,
   Warenkorb und Kasse; das Popup darf Layout und Kaufabschluss nicht stören.

**Vor dem Livegang serverseitig erledigen:** eigene Rückhol-Subdomain mit HTTPS,
Kampagne mit passender `siteId`, Shop-Domains mit und ohne `www` in `SITE_ORIGINS`,
`WEBHOOK_URL` für CRM/Newsletter und `DISABLE_DEMO=1`. Das Widget nutzt keine Cookies,
aber `localStorage` und Ereignisübertragung; die Einordnung im Consent-Manager muss der
Datenschutzverantwortliche freigeben.

## Betrieb & Update (VPS)

Konkrete Zugangsdaten und Hosts stehen in den privaten Betriebsnotizen (nicht im Repo).

**Client-IP und Rate-Limits:** Der Dienst lauscht nur auf `127.0.0.1` und ist
ausschließlich über den Reverse-Proxy erreichbar. Die Zählung pro Besucher verwendet
den letzten Eintrag in `X-Forwarded-For`, also den vom eigenen Proxy angehängten Hop.
Voraussetzung ist, dass der Proxy `X-Forwarded-For` anhängt (Caddy tut das
standardmäßig). Fehlt dieser Header, wird sicher auf die Socket-Adresse
zurückgefallen. `X-Real-IP` und `X-Vercel-Forwarded-For` werden nur mit
`TRUST_PROXY_HEADERS=1` ausgewertet; dann muss der eigene Proxy clientseitig gesetzte
Werte entfernen. Beispiel für Caddy:

```caddyfile
reverse_proxy localhost:<PORT> {
	header_up -X-Real-IP
	header_up -X-Vercel-Forwarded-For
}
```

Wird der Dienst zusätzlich über einen zweiten Proxy erreicht, etwa den Vercel-Rewrite
`/rueckhol/*`, sehen alle Besucher dieses Wegs denselben letzten Hop und teilen sich
einen Zähler. Für den produktiven Widget-Betrieb deshalb die Direkt-Domain verwenden;
der Proxy-Pfad ist für Tests gedacht. Ein gültiges Dashboard-Passwort wird nie von
einem Zähler blockiert: Nur Fehlversuche zählen, damit niemand den Kunden aussperren
kann.

```bash
# Deploy/Update vom kanonischen Stand (data/ NIE mitkopieren — dort lebt die Kunden-DB):
rsync -az --delete --exclude='.git' --exclude='node_modules' --exclude='data' --exclude='.DS_Store' \
  ./ <BENUTZER>@<VPS-IP>:/opt/rueckhol-automatik/
ssh <BENUTZER>@<VPS-IP> 'chown -R fensterradar:fensterradar /opt/rueckhol-automatik \
  && sudo -u fensterradar bash -c "cd /opt/rueckhol-automatik && npm install --no-audit --no-fund && npm test" \
  && systemctl restart rueckhol-automatik'
curl -s https://<rueckhol-host>/api/health   # muss ok:true + neue Version zeigen
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
- `dashboard/` — Kampagnen-Editor mit Live-Vorschau, Auswertung und Leads-Export (mobil-tauglich)
- `demo/demo-test.html` — Test-Shop (simulierter E-Commerce, Popups feuern live) · `demo/alle-popups.html` — Typen-Galerie
- `tests/` — 40 Tests insgesamt
- `tests/api.test.js` — API/CRUD, Auth, Rate-Limits und CSV-Export
- `tests/sanitize.test.js` — Input-, URL- und Formular-Sanitizing
- `tests/widget.test.js` — Widget-Regressionsguards
- `tests/dashboard.test.js` — Dashboard- und Leads-Renderer-Regressionsguards

## Offene Punkte (bewusst, Stand v1.1)

- Leads werden per `WEBHOOK_URL` aktiv an CRM/Zapier/Mail-Bridge gepusht und können
  im Dashboard-Leads-Tab als JSON/CSV abgerufen werden.
- Die Datenbank wird täglich nach `data/backups/` gesichert.
- Der Leads-Export enthält personenbezogene Daten: nur zweckgebunden verarbeiten und
  Zugriff, Rechtsgrundlage sowie Aufbewahrungsfrist vor dem Kundenbetrieb klären.
- DSGVO-Export ist vorhanden; Löschung und automatisierte Aufbewahrung bleiben
  Integrator-/v2-Themen.
- Finales Popup-Design macht der Webdesigner des Kunden (Beispiel-Themes blau/orange).
### Backup wiederherstellen

Dienst stoppen, dann das gewünschte Backup kopieren und den Dienst wieder starten:

`rm -f data/conversion-rescue.sqlite-wal data/conversion-rescue.sqlite-shm && cp data/backups/conversion-rescue-<DATUM>.sqlite data/conversion-rescue.sqlite`

Beim Wiederherstellen müssen `conversion-rescue.sqlite-wal` und
`conversion-rescue.sqlite-shm` neben der Live-Datei ebenfalls gelöscht werden.
