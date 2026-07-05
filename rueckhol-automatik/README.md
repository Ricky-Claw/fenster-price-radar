# Rückhol-Automatik (Conversion Rescue) — eingebettet im Fensterradar-Repo

Testphase: dieser Ordner ist der Original-`conversion-rescue`-Stack, 1:1 in `fenster-price-radar` reinkopiert, damit Popup + Dashboard direkt hier laufen und getestet werden können. Eigenständiger Express-Server + SQLite, kein Next.js/Supabase, keine Abhängigkeit zum Rest des Fensterradar-Repos (Vite-App bleibt unberührt).

**Später beim Kunden:** wenn die Testphase durch ist, zieht dieser Ordner auf einen echten Server um (VPS o.ä.) — SQLite braucht ein persistentes Dateisystem, läuft NICHT auf Vercel-Serverless. Bis dahin: lokal/testweise hier drin.

`reference/{core,snippet,theme}.ts` aus dem Original-Repo wurden bewusst **nicht mitkopiert** (waren nur Portierungs-Notizen, kein Laufzeit-Code).

## Design & CD

Das Popup-Design ist pro Kampagne frei einstellbar — Farben, Schrift, Ecken-Radius, Logo, Position (mittig/Ecke/Balken), siehe `server/lib/theme.js` (`THEME_PRESETS`, `normalizeTheme`). Die 3 mitgelieferten Presets (Harbor/Clay/Noon) sind **nur Platzhalter/Ausgangspunkte**, keine Endversion.

**Alex passt das Design an das jeweilige CD der Kundenseite an**, bevor eine Kampagne live geht. Alle Varianten nebeneinander zum Ansehen/Abstimmen: `demo/alle-popups.html` (siehe Setup unten).

## Setup (aus dem Fensterradar-Repo-Root)

```bash
npm run rueckhol         # startet Server auf :8080 (PORT env überschreibbar)
npm run rueckhol:test    # 8 Tests, node --test, sollten grün sein
```

Oder direkt in diesem Ordner: `npm install && npm start` / `npm test`.

Kein echter `npm install`-Download nötig für `better-sqlite3`/`express` — beide sind Node-Stdlib-Shims unter `vendor/` (kein `node:sqlite`-Experimental-Warning-Risiko außer der Laufzeitwarnung selbst), `npm install` legt nur die lokalen Symlinks an.

Dashboard: `http://localhost:8080/dashboard` · Testseite (echter Seitenkontext, Exit-Intent live testen): `http://localhost:8080/demo/fensterradar-test.html` (identisch zu `public/rueckhol-test.html` im Hauptrepo, aber mit funktionierendem relativem `cre.js`-Pfad) · **Design-Galerie (alle Popup-Varianten nebeneinander, ohne Trigger/Cooldown, für Alex/CD-Abstimmung):** `http://localhost:8080/demo/alle-popups.html`.

## Env-Variablen

| Var | Zweck | Default |
|---|---|---|
| `PORT` | Server-Port | `8080` |
| `ADMIN_TOKEN` | Bearer-Token für `/api/campaigns` (CRUD). **Ohne gesetzt: Admin-Routen offen** — nur für lokale Entwicklung so lassen, vor jedem echten Deploy setzen. | leer (Warnung im Log) |
| `SITE_ORIGINS` | JSON `{"siteId": ["https://origin1", "https://origin2"]}` — CORS-Allowlist für `/api/config`, `/api/events`, `/api/submit`. **Ohne gesetzt: CORS erlaubt alle Origins** — vor Prod-Deploy setzen. | leer (allow-all + Warnung) |
| `WEBHOOK_URL` | optional — bekommt POST bei jeder Formular-Submission (Lead/Contact/Newsletter) | leer (kein Webhook) |

## Struktur

- `server/index.js` — Express-App, alle Routen (siehe unten)
- `server/db.js` — SQLite-Schema + Queries (`data/conversion-rescue.sqlite`)
- `server/lib/sanitize.js` — Input-Cleaning (Text, URLs, Trigger/Action-Config, Submission-Validierung inkl. Consent+E-Mail)
- `server/lib/theme.js` — Theme-Presets für den Popup-Look
- `server/lib/analytics.js` — Funnel-Auswertung (`summarizeAnalytics`)
- `widget/cre.js` — das eigentliche Embed-Script (Shadow DOM, Trigger, Consent, Frequency-Cap)
- `dashboard/` — visueller Kampagnen-Editor mit Live-Vorschau + Analytics-Ansicht (statisch, `/dashboard`)
- `demo/` — Testseiten, u.a. Kopien der Archipel-Inseln (`quittung-index.html`, `fensterradar-test.html`) zum Ausprobieren des Widgets im echten Seitenkontext, plus `alle-popups.html` (Design-Galerie aller Aktionen/Presets nebeneinander, für CD-Abstimmung mit Alex)
- `tests/` — Unit/Integration-Tests für sanitize, analytics, API

## API

Öffentlich (CORS-gated über `SITE_ORIGINS`):
- `GET /api/config?siteId=X` — aktive Kampagnen für die Seite, die das Widget lädt
- `POST /api/events` — Tracking-Events (`popup_shown`, `cta_click`, Conversion-Typen)
- `POST /api/submit` — Formular-Submissions (lead/contact/newsletter), erzwingt Consent + validiert E-Mail

Admin (gated über `ADMIN_TOKEN`, `Authorization: Bearer <token>`):
- `GET/POST/PUT/DELETE /api/campaigns` — Kampagnen-CRUD
- `GET /api/analytics?siteId=X` — Funnel-Zahlen (allTime + last7Days)

Statisch:
- `GET /cre.js` — das Embed-Script
- `/dashboard`, `/demo` — statische Verzeichnisse

## Einbau auf einer Kundenseite

```html
<script async src="https://<deploy-host>/cre.js" data-cre-site="<siteId>"></script>
```

`siteId` muss zu einer Kampagne in der DB passen (`site_id`-Feld) und zu einem Eintrag in `SITE_ORIGINS` für die Origin der Einbettseite.

## Test-Einbindung: Fensterradar

`~/fenster-price-radar/public/rueckhol-test.html` (Commit `bbe6d3c`, 2026-07-02) bindet das Widget testweise ein:

```html
<script async src="http://localhost:8080/cre.js" data-cre-site="fensterradar" data-cre-api="http://localhost:8080"></script>
```

- Zeigt aktuell auf `localhost:8080` — läuft nur, wenn dieser Server lokal läuft. Für Live: Server hosten, `data-cre-api` auf https-URL umstellen.
- Für `siteId="fensterradar"` existiert noch **keine Kampagne** in der DB — im Dashboard (`/dashboard`) erst anlegen, sonst zeigt das Popup nichts.
- `vercel.json` im Fensterradar-Repo hat einen Ausnahme-Eintrag, damit diese Seite nicht vom SPA-Rewrite geschluckt wird — bei Änderungen an Vercel-Routing dort gegenprüfen.

## Offene Punkte (Stand 2026-07-01, letzter Commit)

- **Kein Deploy.** Läuft nur lokal. Für Archipel-Inseln (`porto`/`quittung`, PHP-Backend + eigener `storage/`) gilt: **nicht mit wipe-deploy-Tools ausrollen** — siehe Warnung im Hauptrepo-Memory zu Archipel (`deployStaticWebsite` würde Live-Server-Daten löschen). Dieses Repo hier läuft separat als eigener Node-Prozess, nicht als Datei-Injection in die Insel-Statik.
- **Zwei parallele CRE-Implementierungen existieren:** dieses Repo UND `src/frontend/lib/cre/*` im Hauptrepo (Supabase-backed, live für DFS). Beide zielen z.T. auf dieselben Sites (`porto`/`quittung`). Vor Produktiv-Einsatz klären, welches System für welche Site die Quelle der Wahrheit ist — sonst doppelte/widersprüchliche Analytics.
- `data/conversion-rescue.sqlite*` liegt im Repo — vermutlich Testdaten aus der Entwicklung, vor Deploy prüfen/löschen.
- Analytics hat kein Page-Breakdown (nur Action/Trigger/Reason) und keinen Export.
- `ADMIN_TOKEN`/`SITE_ORIGINS` sind in keiner `.env`-Datei hinterlegt (auch keine `.env.example`) — beim Deploy manuell setzen.
