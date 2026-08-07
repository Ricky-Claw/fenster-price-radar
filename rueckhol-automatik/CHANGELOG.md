# Changelog — Rückhol-Automatik

Format: eine Sektion pro Version, neueste oben. Version auch in `package.json`
und im Kopf-Kommentar von `widget/cre.js` pflegen (abfragbar via `GET /api/health`).

## 1.7.3 — 2026-08-06

- Fix: Die produktive Dashboard-CSP blockierte externe HTTPS-Logos in der
  Live-Vorschau, obwohl solche Logo-URLs als Kampagnendesign unterstützt und
  gespeichert werden. `img-src` erlaubt im geschützten Dashboard jetzt HTTPS;
  die übrigen CSP-Grenzen bleiben unverändert.
- CRM: `RUECKHOL_AUTOMATIK_LEAD_TOKEN` ist jetzt der zweckgebundene Zugang für
  die Lead-Weiterleitung. Der bisherige allgemeine Token bleibt als kompatibler
  Fallback bestehen und muss nicht überschrieben werden.
- Dashboard: Der „Was ist neu"-Banner zeigt jetzt ebenfalls v1.7.3 statt des
  veralteten Stands v1.6.3; ein Test verhindert erneute Versionsabweichungen.

## 1.7.2 — 2026-08-06

- Fix: Browser behandelten `sendBeacon` für die Cross-Origin-Tracking-Endpunkte
  als Request mit Credentials. Obwohl die Kundendomain erlaubt war, fehlte in
  Preflight und Antwort `Access-Control-Allow-Credentials: true`; dadurch wurden
  Popup-Events von CORS blockiert. Der Header wird jetzt ausschließlich für
  explizit in `SITE_ORIGINS` freigegebene Origins gesetzt.

## 1.7.1 — 2026-08-06

- Fix: die neue Weiterleitung (v1.7.0) loggte einen Fehlschlag nur bei
  echtem Netzwerkausfall — antwortete das Zielsystem ganz normal mit
  4xx/5xx (z. B. 403 bei falschem Token), blieb das komplett
  stillschweigend unbemerkt. Live am echten Endpunkt bestätigt (403
  ISLAND_MISMATCH kam durch, ohne jede Log-Zeile). Jetzt wird jede
  nicht-2xx-Antwort mit Status + Body geloggt.

## 1.7.0 — 2026-08-06

- Newsletter-Anmeldungen und Kontakt-/Rückruf-Anfragen aus den Popups
  werden jetzt zusätzlich automatisch weitergeleitet: Newsletter an die
  Schwarzwald-Agent-Newsletter-Liste (`POST /api/nl/subscribe`), Kontakt/
  Rückruf ins Schwarzwald-Agent-CRM über den Archipel-Lead-Contract
  (`POST /api/leads/intake`, Bearer-Token). Feuer-und-vergessen — ein
  Ausfall des Zielsystems verzögert oder blockiert nie die Antwort an den
  Besucher, nur geloggt. Ohne konfigurierte Umgebungsvariablen
  (`SCHWARZWALD_AGENT_BASE_URL`, `SCHWARZWALD_NL_LIST_ID`,
  `SCHWARZWALD_ARCHIPEL_TOKEN`) bleibt die Weiterleitung inaktiv — reine
  Zusatzfunktion, ändert nichts am bestehenden Verhalten ohne diese Werte.

## 1.6.3 — 2026-08-05

- „Was ist neu"-Banner im Dashboard: zeigt kurz die letzten Verbesserungen
  (Auswertungsfenster, Einbau-Prüfung, Sicherheitsrunde, aufgeräumte
  Startseite), einmal wegklickbar (merkt sich die gesehene Version lokal
  im Browser, taucht bei der nächsten inhaltlichen Änderung wieder auf).

## 1.6.2 — 2026-08-05

Fünf offene Sicherheitsfunde aus dem Vollaudit geschlossen, zwei weitere
per unabhängiger Gegenprüfung während dieser Runde selbst gefunden und
sofort mitgefixt (live gegen den echten Angriff nachgestellt):

- `custom_css` (landet live in einem `<style>` bei jedem Besucher): CSS-
  Escape-Sequenzen (`@\69mport "https://evil..."`) umgingen den Filter
  komplett. Erster Fix dekodierte nur einmal — ein verschachtelter Escape
  (`\00005c69mport`) überlebte trotzdem, weil das Dekodieren selbst wieder
  einen rohen Escape erzeugen kann. Jetzt wird bis zum Fixpunkt dekodiert
  (max. 8 Durchläufe), erst danach gefiltert.
- `/api/campaigns`, `/api/analytics`, `/api/submissions`, `/dashboard/`
  waren komplett ohne Rate-Limit auf falsche Zugangsdaten erreichbar.
  Neues Limit (20 Fehlversuche/15 Min pro IP) greift nur bei
  fehlgeschlagener Auth, nie bei Erfolg — kein Risiko, sich selbst
  auszusperren.
- Eine Kampagne konnte per Update stillschweigend auf eine andere Site
  umgehängt werden (`site_id` im Payload gewann einfach). `site_id` ist
  jetzt nach dem Anlegen unveränderlich; Verschieben = löschen + neu
  anlegen. Beim Gegenprüfen zeigte sich: derselbe Übernahme-Angriff ging
  auch über Neuanlegen mit einer fremden, bereits vergebenen ID (Anlegen
  bekam nie ein `existing`, der Sperre griff nicht) — jetzt lehnen sowohl
  `PUT/POST /api/campaigns` als auch `popup_create`/`popup_update` das
  explizit ab, statt die fremde Kampagne zu überschreiben.
- Security-Header + Content-Security-Policy neu auf `/`, `/login`,
  `/dashboard/` (nicht auf Widget/API — die bleiben cross-origin
  einbettbar, absichtlich unverändert).
- Leads-Tabelle (`/api/submit`) wächst nicht mehr unbegrenzt — gleiche
  zeitbasierte Aufbewahrung + Site-Deckel wie bei Events.

## 1.6.1 — 2026-08-05

- MVP-Vorschau-Features entfernt: Test-Shop (`demo/demo-test.html`) und
  Popup-Galerie (`demo/alle-popups.html`) waren nur zur Kundenabnahme
  gedacht, Produkt ist verkauft/live. Karten von der Startseite entfernt,
  Dateien gelöscht.

## 1.6.0 — 2026-08-05

- Auswertung um vier Zeitfenster erweitert: Letzter Monat, 3 Monate,
  6 Monate, Jahr — neben den bestehenden Letzte 7 Tage/Gesamt. Sechs
  Chips im Dashboard, gleiches rollierendes Tage-Muster wie bisher.

## 1.5.0 — 2026-08-05

- Analytics gegen Fälschung und dauerhaften Datenverlust abgesichert:
  Aufbewahrung ist jetzt zeitbasiert (400 Tage) statt zählbasiert — eine
  Flut gefälschter Events kann keine echte Historie mehr verdrängen.
  `created_at` wird ausschließlich serverseitig gesetzt (Client-Wert wird
  ignoriert), zusätzlich hartes Mengenlimit pro Site (50.000, mit
  kanonisch kleingeschriebener `site_id` — `demo`/`DEMO` teilen sich ein
  Kontingent). Neuer, vom Dashboard-Session-Schlüssel unabhängiger
  `eventToken` (ausgeliefert über `/api/config`) ist für `/api/events` und
  `/api/submit` erforderlich, sobald ein Passwort konfiguriert ist.
  Event-Typ-Whitelist ergänzt. Tägliches Datei-Backup mit WAL-Checkpoint
  und Rotation (30 Tage), läuft auch bei fehlgeschlagenem Checkpoint weiter.

## 1.4.0 — 2026-08-05

- Neuer Dashboard-Knopf "Einbau prüfen": `GET /api/install-check?siteId=X`
  holt serverseitig die in `SITE_ORIGINS` hinterlegten Domains ab und prüft,
  ob das Snippet (`cre.js` + passendes `data-cre-site`) dort im HTML steht —
  niemals gegen eine vom Aufrufer angegebene URL, nur gegen bereits
  admin-konfigurierte Domains. Redirects werden nicht automatisch verfolgt
  (Absicherung gegen SSRF auf interne Ziele), Antworten sind auf 2 MB
  gestreamt begrenzt, HTML-Kommentare/`<textarea>`/`<pre>` werden vor der
  Suche entfernt (kein Fehlalarm durch auskommentierte/inaktive Snippets),
  und die Route hat ein eigenes Rate-Limit (10/Minute).

## 1.3.0 — 2026-08-04

- MCP-Server für Agenten zieht von Vercel direkt auf diesen Server um (`POST
  /api/mcp`, gleiche sechs Popup-Werkzeuge, jetzt mit direktem Datenbankzugriff
  statt HTTP-Umweg). Auth über eigenständiges `ADMIN_TOKEN`, eigenes Rate-Limit
  auf fehlgeschlagene Auth-Versuche.

## 1.2.0 — 2026-08-04

- Mehrere Einschlussmuster und Seitenausschlüsse für Kampagnen.

## 1.1.0 — 2026-07-29

**Neu**
- Leads-Tab im Dashboard mit sicherer Tabellenansicht und CSV-Download.
- Optionaler Freebie-Download-Link für Newsletter-Anmeldungen.
- Optionaler Datenschutz-Link für Newsletter- und Kontaktformulare.

**Verbessert**
- Mobile-Fixes im Widget für besser bedienbare Popups auf kleinen Bildschirmen.
- Seitenweiter Frequenz-Deckel verhindert zu häufige Popups über Kampagnen hinweg.
- Der Seiten-Deckel blockiert nur andere Kampagnen; die zuletzt gezeigte folgt ihrer eigenen Wiederholungszeit. Produktions-Trigger respektieren Deckel, Test-Trigger können sie gezielt umgehen.

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
