# Changelog — Rückhol-Automatik

Format: eine Sektion pro Version, neueste oben. Version auch in `package.json`
und im Kopf-Kommentar von `widget/cre.js` pflegen (abfragbar via `GET /api/health`).

## 1.14.0 — 2026-08-12

- **Fix: erfolgreiche Abschlüsse zählten teils auch als „weggeklickt".** Nach
  einem Gutschein, einer Anmeldung oder einer Kontaktanfrage bleibt das
  Popup offen (Dankeschön-Text) und der Besucher schließt es selbst — bisher
  wurde dieses Schließen als verlorenes Popup mitgezählt, obwohl die
  Kampagne schon erfolgreich war. Ein Popup, das bereits konvertiert hat,
  zählt beim Schließen nicht mehr als „weggeklickt".
- **Mouseover an allen Analytics-Zahlen:** Gezeigt, Klickrate, Abschlüsse,
  Abschlussquote und Weggeklickt (KPI-Kacheln und je Kampagne) erklären beim
  Draufhalten in einem Satz, was genau gezählt wird — „Interagiert" und
  „Abgeschlossen" sind zwei unabhängige Zähler, kein Popup zählt doppelt in
  einer Kategorie.

## 1.13.0 — 2026-08-11

- **Angehängte Dateien im Leads-Bereich sichtbar.** Bisher wurde eine
  hochgeladene Fensterliste zwar gespeichert und ans CRM übergeben, tauchte
  in der Leads-Übersicht aber nirgends auf — man sah den Lead und wusste
  nicht, dass eine Liste dabei ist. Jetzt steht Dateiname und Größe in einer
  eigenen Spalte, ein Klick öffnet die Datei. Ist sie nach Ablauf der
  Aufbewahrung nicht mehr da, steht das dort ehrlich, statt einen Link
  anzubieten, der ins Leere führt.

## 1.12.0 — 2026-08-11

- **Eigene Eingabezeilen im Kontakt-Popup:** Je Kampagne lassen sich bis zu
  fünf zusätzliche Felder anlegen und frei beschriften — etwa „Rufnummer".
  Für jede Zeile wählen Sie die Art (Text, Telefon, E-Mail, Zahl); auf dem
  Handy erscheint dann die passende Tastatur. Eine Telefon-Zeile landet im
  CRM im dafür vorgesehenen Rufnummern-Feld, alle übrigen Angaben hängen
  klar beschriftet unter der Nachricht. Kampagnen ohne Zusatzfelder
  verhalten sich unverändert.

## 1.11.1 — 2026-08-11

- Alle Standardtexte sind jetzt auf Deutsch. Bisher steckten englische
  Vorgaben im Code — am sichtbarsten der Zustimmungstext an der Hakenbox
  („I agree that my details may be used…"). Weil der Server diese Vorgaben
  beim Speichern einsetzt, konnten sie bis zum Besucher durchschlagen,
  sobald ein Feld leer blieb. Betroffen waren Zustimmungstexte,
  Bestätigungsmeldungen, Button-Beschriftungen sowie Überschrift und Text
  neuer Kampagnen.

## 1.11.0 — 2026-08-11

- **Leads zeigen jetzt Herkunft:** In der Leads-Übersicht steht neben jedem
  Eintrag, aus welcher Kampagne und von welcher Seite er stammt — auch in der
  CSV-Ausgabe. Die Seite wird ab dieser Version erfasst; bei älteren Leads
  bleibt das Feld leer. Aus der gespeicherten Adresse werden Frage- und
  Rautezeichen samt allem dahinter entfernt, damit Suchbegriffe, Werbe-
  Parameter und Sitzungskennungen gar nicht erst im Lead-Datensatz landen.
- **Knopf „Erneut senden"** je Lead: übergibt einen Lead noch einmal ans CRM,
  falls die automatische Übergabe nicht ankam oder im Spam landete. Anders
  als die automatische Übergabe wartet der Knopf auf die Antwort und meldet
  ehrlich, was passiert ist — ist die Übergabe auf dem Server gar nicht
  eingerichtet, sagt er das, statt Erfolg vorzutäuschen. Höchstens
  10 Sendungen pro Minute, damit Doppelklicks nichts anrichten. Eine
  hochgeladene Datei geht wieder mit; die Lead-Kennung bleibt gleich, damit
  im CRM keine Dublette entsteht.
- **Empfänger je Seite einstellbar** („Lead-Mail an" in der Kopfzeile, leer =
  Standardempfänger). Ungültige Adressen werden abgelehnt, der gespeicherte
  Wert bleibt erhalten.
- **Neues Agenten-Werkzeug `popup_pause`:** Agenten können die Anzeige-Pause
  jetzt lesen und setzen — **gedeckelt auf 24 Stunden**. Längere Pausen
  bleiben dem Dashboard vorbehalten (dort weiterhin bis 168), damit eine
  unglückliche Anweisung die Popups einer ganzen Seite höchstens einen Tag
  stilllegen kann. Werte außerhalb der Grenze werden abgelehnt statt
  stillschweigend zurechtgestutzt.

## 1.10.0 — 2026-08-11

- **Datei-Upload im Angebots-Popup:** Besucher können optional eine Fensterliste
  anhängen; sie geht zusammen mit der Anfrage ans CRM und per Mail an DFS.
  Ein fehlgeschlagener Upload blockiert die Lead-Abgabe nicht — die Anfrage
  kommt auch ohne Datei an. Dateien werden 7 Tage aufbewahrt und danach
  automatisch bereinigt; gelöscht wird nur, was belegt zugestellt wurde.
  Erlaubt sind PDF, JPEG, PNG, CSV und echte XLSX-Dateien (max. 10 MB);
  das alte `.xls`-Format bleibt bewusst außen vor, weil sich Makros darin
  ohne tiefe Prüfung nicht ausschließen lassen.

## 1.9.0 — 2026-08-11

- Die Steuerung trägt jetzt das Design des Deutschen Fenstershops. Farben,
  Schriften, Radien und Schatten stammen 1:1 aus dem DFS-Design-System:
  Dunkelblau (#003A66) für Marke und Oberfläche, Orange (#F47C26)
  ausschließlich für die wichtigste Aktion — laut Styleguide wirkt Orange
  als Flächenfarbe billig. Helvetica für Überschriften, Arial für Fließtext.
- Die externe Schriftart (Inter über rsms.me) ist entfallen; Arial und
  Helvetica sind systemeigen. Dadurch lädt das Dashboard nichts mehr von
  fremden Servern nach, und die Sicherheitsrichtlinie (CSP) konnte den
  fremden Host verlieren.
- Die kurze Anleitung ist auf dem aktuellen Stand: Seiten-Eingrenzung,
  „Einbau prüfen", das Zusammenspiel von Anzeige-Pause und Kampagnen-Deckel,
  die sechs Auswertungs-Zeiträume und der Leads-Bereich mit CSV-Download.
- Zwei Darstellungsfehler nebenbei behoben: Auf dem Handy stand „Einbau
  prüfen" vor dem Produktnamen (dem Knopf fehlte eine Reihenfolge, wodurch
  er nach vorn rutschte), und leere Hüllen rissen oben eine grundlose Lücke
  in die Seite.

## 1.8.0 — 2026-08-11

- Die „Anzeige-Pause" ist jetzt je Seite einstellbar (Feld in der Kopfzeile des
  Dashboards, 0–168 Stunden, **Standard 0 = keine Pause**). Bisher waren
  6 Stunden fest verdrahtet: ein einmal gezeigtes Popup sperrte **alle anderen**
  Kampagnen — auch die inhaltlich passenden eines ganz anderen Seitenbereichs.
  Dadurch sah ein Besucher, der vom Ratgeber in den Konfigurator wechselte,
  dort nichts, und jeder Test war nach dem ersten Popup blind. Wie oft eine
  **einzelne** Kampagne demselben Besucher erscheint, bleibt unverändert in der
  Kampagne einstellbar (Standard 24 Stunden).
- Beim Bauen dieser Einstellung fielen zwei Fehler auf, beide live nachgestellt
  und mitgefixt: das Speichern der Pause überschrieb den gepflegten
  Anzeigenamen der Seite mit der blanken Kennung („Deutscher Fenstershop"
  wurde zu „dfs"), und ungültige Eingaben (999, 2,5, leer) landeten
  kommentarlos bei 0 — also ausgerechnet „keine Pause" — und wurden trotzdem
  als Erfolg gemeldet. Solche Eingaben werden jetzt abgelehnt, der zuvor
  gespeicherte Wert bleibt stehen.
- Die Datenbank wird beim Start automatisch erweitert; bestehende
  Installationen behalten ihre Daten (gegen eine echte Alt-Datenbank geprüft).
- Neu je Kampagne: **„Anzeige-Pause der Seite ignorieren"**. Damit laufen
  Testkampagnen auf ausgewählten Seiten ungebremst, während die üblichen
  Kampagnen weiter pausieren. Solche Kampagnen werden von der Pause weder
  blockiert noch lösen sie selbst eine aus; der Deckel für die *eigene*
  Wiederholung (Standard 24 Stunden) gilt unverändert weiter.

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
