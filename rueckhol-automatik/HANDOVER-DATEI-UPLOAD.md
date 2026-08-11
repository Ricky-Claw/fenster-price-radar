# Handover: Datei-Upload für Rückhol-Popups (Fensterliste → CRM + Mail)

> **Für eine neue Session.** Alles unten ist am 2026-08-11 live gegengeprüft, nicht aus
> Erinnerung. Kopiere den Abschnitt „Auftrag" als Startprompt, der Rest ist Kontext.

---

## Ziel

Besucher soll im Angebots-Popup eine **Fensterliste hochladen** können (PDF/Excel/Bild/CSV).
Die Datei muss (a) beim Lead im CRM landen und (b) per Mail mitgeschickt werden, damit
DFS direkt ein Angebot rechnen kann.

---

## Ausgangslage — was schon läuft (verifiziert, nicht annehmen)

**Rückhol-Automatik v1.7.3**, lokal = origin = Produktion in Sync.
Live auf `https://rueckhol.schwarzwald-agent.de` (VPS `crocodile`, `/opt/rueckhol-automatik`,
systemd `rueckhol-automatik`, Port 8791 hinter Caddy).

| Baustein | Stand |
|---|---|
| Snippet auf `deutscher-fenstershop.de` | ✅ site-wide eingebaut (`data-cre-site="dfs"`) |
| 4 Kampagnen aktiv, überschneidungsfrei | ✅ von Agent Alpha gesetzt, live getestet |
| Newsletter → Schwarzwald `nl_contacts` | ✅ live (DOI, landet als `pending`) |
| **Kontakt/Lead → CRM `archipel_leads`** | ✅ **live** — Probe 2026-08-11: `200 {ok:true, crmId:…}` |
| Attachment-Datei → Supabase Storage | ❌ **fehlt** (das ist der Auftrag) |
| Mail mit Anhang an DFS | ❌ **fehlt** (das ist der Auftrag) |

### Falle: zwei Tokens, nur einer stimmt
`server/index.js:163` liest **`RUECKHOL_AUTOMATIK_LEAD_TOKEN`** und fällt nur ersatzweise
auf `SCHWARZWALD_ARCHIPEL_TOKEN` zurück. Der **Fallback ist auf Vercel NICHT registriert**
→ ein Test damit gibt `403 ISLAND_MISMATCH` und sieht fälschlich nach „kaputt" aus.
**Immer mit `RUECKHOL_AUTOMATIK_LEAD_TOKEN` testen.** Beide liegen in
`/etc/rueckhol-automatik/service.env` (nie in Chat/Repo kopieren).

---

## Zwei Repos, zwei Seiten

```
BESUCHER  ─►  cre.js (Widget)          ─►  POST /api/submit        ─►  forward.js
              [Upload-Feld fehlt]           [Datei annehmen fehlt]      [Attachment senden fehlt]
              ══════ Repo A: ~/fenster-price-radar/rueckhol-automatik/ ══════
                                                      │
                                                      ▼  archipel.lead/v1 + attachments[]
              ══════ Repo B: ~/Schwarzwald-Agent Fable 5/src/frontend/ ══════
                          POST /api/leads/intake  ─►  archipel_leads  ─►  Admin-CRM-UI
                          [Schema kennt Attachments ✅]  [nur Metadaten]   [zeigt sie ✅]
                                     │
                                     ▼  [FEHLT] Datei holen → Supabase Storage → Mail
```

**Repo A** — `~/fenster-price-radar/rueckhol-automatik/` (Branch `main`, Push = kein Auto-Deploy,
Deploy von Hand per rsync, siehe unten).
**Repo B** — `~/Schwarzwald-Agent Fable 5` (Next.js, Branch `master`, Push = Vercel-Deploy).
Für Repo B **eigenen Worktree** nehmen, das Haupt-Repo ist von anderen Sessions belegt.
Fertiger Worktree existiert: `~/schwarzwald-worktree-rueckhol` (Branch `claude/rueckhol-cockpit-link`,
`.env.local` liegt drin, `npm ci` gelaufen — für einen neuen Task besser frischen Branch von
`origin/master` ziehen).

---

## Was auf der Empfängerseite schon da ist (spart viel Arbeit)

Der Archipel-Contract hat Attachments **bereits spezifiziert und implementiert-bis-Metadaten**:

- `lib/archipel/schema.ts:10` — `attachmentSchema`: `filename` (≤300), `mime` (≤160),
  `size` (int, ≤50 MB), `sha256?`, `url?`, `contentBase64?` (≤360 000 Zeichen ≈ 256 KB),
  `stored?`. Feld am Lead: `attachments: z.array(...).max(20).optional()`.
- `lib/archipel/store.ts:62` — `attachments` werden beim Upsert gespeichert.
- `lib/archipel/types.ts:33` — Kommentar sagt ausdrücklich: Ablage in Supabase Storage
  ist **„Folge-Slice"**, also noch nicht gebaut. Das `stored`-Flag existiert nur als Platzhalter.
- `lib/archipel/admin-leads.ts:50,77` — Admin-CRM liest Attachments schon aus.
- Vertragstext: `docs/integrations/archipel-lead-contract.md` §7 — **URL-Referenz bevorzugt**,
  base64 nur < 256 KB, Gesamt-Payload ≤ 1 MB.

**Heißt:** Der Wire-Vertrag muss NICHT geändert werden. Nur füllen + die zwei fehlenden Stufen bauen.

Mail-Infrastruktur existiert: `lib/email/transactional.ts` (+ Tests). Für Archipel-Leads ist
aktuell **kein** Benachrichtigungs-Mailversand verdrahtet — der ist neu zu bauen.

---

## Auftrag (Startprompt für die neue Session)

> Baue den Datei-Upload für die Rückhol-Popups: Besucher lädt im Angebots-Popup eine
> Fensterliste hoch, die Datei landet beim Lead im Schwarzwald-CRM und geht per Mail an DFS.
> Kontext + verifizierter Ist-Stand: `rueckhol-automatik/HANDOVER-DATEI-UPLOAD.md`.
> Betrifft zwei Repos (Rückhol-Server/Widget + Schwarzwald-Cockpit).
> Das ist sicherheitskritisch (öffentlicher Upload von jedem Website-Besucher) —
> bitte als Lanista-Runde: planen, Codex baut, zwei unabhängige Prüfer, jeder Fund live
> gegen den echten Angriff nachgestellt, erst dann Deploy.
> Halte dich an die Phasen 1–4 im Handover und deren Reihenfolge.

---

## Phasen (in dieser Reihenfolge, jede einzeln deploybar)

### Phase 1 — Upload-Endpunkt im Rückhol-Server (Repo A)
Neuer `POST /api/upload`, der die Datei annimmt, sicher ablegt und eine **token-geschützte,
ablaufende Abruf-URL** zurückgibt (die geht dann als `attachments[].url` mit dem Lead raus).

Harte Anforderungen:
- **Allowlist statt Blockliste**: nur `application/pdf`, `image/jpeg`, `image/png`,
  `text/csv`, Excel (`…sheet`, `…ms-excel`). **Kein SVG** (aktives Skript), keine Archive,
  keine Office-Makro-Formate.
- MIME **aus dem Inhalt prüfen** (Magic Bytes), nicht dem Client-`Content-Type` glauben.
- Größenlimit hart am Stream (nicht erst nach dem Puffern), Vorschlag **10 MB**.
- Dateiname NIE als Pfad verwenden — serverseitig zufälligen Namen vergeben
  (Path-Traversal, Unicode-Tricks, Überschreiben fremder Dateien).
- Ablage außerhalb des ausgelieferten Verzeichnisses, **niemals ausführbar**, Auslieferung
  immer mit `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
- Rate-Limit wie bei `/api/submit`, und **`eventToken` verlangen** (gleiches Gate wie Events/Submit,
  siehe `requireEventToken` in `server/index.js`) — sonst ist es ein offener Datei-Ablageplatz.
- Aufbewahrung begrenzen (Vorschlag 30 Tage, dann löschen) — analog zur Events/Submissions-Retention
  in `server/db.js`.

### Phase 2 — Widget-Feld (Repo A, `widget/cre.js`)
Kontaktformular wird gebaut in **`cre.js:178`** (`data-cre-form="contact"`).
Dort ein optionales Datei-Feld ergänzen + Upload vor dem Absenden, `attachments`-Info
an `/api/submit` mitgeben. Absenden in `cre.js:223 ff.`
- Nur bei den **Angebots-Kampagnen** anbieten, nicht bei jedem Kontakt-Popup →
  über `action_config` steuerbar machen (z. B. `allowUpload: true`), damit es im Dashboard
  pro Kampagne schaltbar ist.
- Fortschritt/Fehler im Popup anzeigen, Popup darf bei Upload-Fehler **nicht** blockieren:
  Lead muss auch ohne Datei absendbar bleiben.

### Phase 3 — Weiterleitung füllen (Repo A, `server/lib/forward.js`)
`forwardContactLead(...)` um `attachments: [{filename, mime, size, sha256, url}]` ergänzen.
- **URL-Referenz bevorzugen** (Contract §7), base64 nur als Fallback < 256 KB.
- `sha256` mitschicken — die Gegenseite soll die Datei prüfen können.
- Achtung: Weiterleitung ist **feuer-und-vergessen** und darf die Besucher-Antwort nie
  verzögern/blockieren (v1.7.1 hat das abgesichert, inkl. Logging von 4xx/5xx — **nicht** kaputt machen;
  Regressionstests in `tests/forward.test.js`).

### Phase 4 — Empfängerseite: Datei sichern + Mail (Repo B)
1. In `app/api/leads/intake/route.ts` nach dem Upsert: Datei **serverseitig** von der URL holen
   → Supabase Storage → `stored: true` setzen (das Feld ist dafür schon vorgesehen).
   **SSRF-Falle:** die URL kommt von außen. Nur die bekannte Rückhol-Domain zulassen,
   `redirect: 'manual'`, Timeout, Byte-Cap beim Streamen, keine internen IPs
   (Muster existiert im Repo: `lib/llm/safe-base-url.ts`, und im Rückhol-Repo bei `install-check`).
2. `sha256` gegenprüfen, bei Abweichung nicht speichern.
3. Mail an DFS mit Anhang über `lib/email/transactional.ts`. **Stand 2026-08-11:**
   `lib/archipel/lead-notify.ts` existiert bereits (noch **untracked** im Worktree
   `~/schwarzwald-worktree-rueckhol` — eine andere Session arbeitet daran, dort
   nichts überschreiben). Empfänger kommt aus `ARCHIPEL_LEAD_NOTIFY_TO`.
   Mailgröße beachten → große Dateien besser als Download-Link statt Anhang.

   **Neue Anforderung (Elvis, 2026-08-11):** Jede Lead-Mail soll zusätzlich als
   **CC** an Herrn Krzemien gehen. `lead-notify.ts` kennt aktuell nur `to`, kein
   `cc` — muss ergänzt werden (Adresse über eine eigene Env-Variable, z. B.
   `ARCHIPEL_LEAD_NOTIFY_CC`, nicht hart im Code).

   ⚠️ **Vor dem Einbau klären:** Elvis nannte
   `krzemien@deutscher-fensterhsop.de` — die Domain ist dort verdreht
   (`fensterhsop` statt `fenstershop`). Die richtige Domain lautet
   `deutscher-fenstershop.de`. Die Tippfehler-Domain existiert derzeit nicht
   (NXDOMAIN geprüft), Mails würden also nur zurückkommen — aber sobald sie
   jemand registriert, gingen Lead-Daten (Name, E-Mail, Nachricht, hochgeladene
   Fensterliste) an Fremde. Deshalb: **Adresse von Elvis bestätigen lassen**,
   nicht raten.
4. Admin-CRM-UI zeigt Attachments schon an (`lib/archipel/admin-leads.ts`) — prüfen, ob
   ein Download-Link für `stored`-Dateien ergänzt werden muss.

---

## Verifikation (nichts gilt als fertig ohne)

```bash
# Repo A — Tests (Node 22+ nötig, node:sqlite)
cd ~/fenster-price-radar/rueckhol-automatik
~/.nvm/versions/node/v24.13.0/bin/node --test tests/*.test.js     # aktuell 86 grün

# Repo B — Typen + Guards
cd <worktree>/src/frontend
npx tsc --noEmit
npx vitest run lib/archipel lib/cockpit/__tests__
```

- **Live gegen den echten Angriff testen**, nicht nur Unit-Tests: manipulierte MIME-Typen,
  Doppel-Endung, riesige Datei, Path-Traversal im Dateinamen, SSRF-URL auf `169.254.169.254`
  und `localhost`.
- Danach End-to-End auf einer **echten** DFS-Seite (z. B. `/kaufen/alu-fenster`):
  Popup öffnen, Datei hochladen, absenden → Lead im CRM prüfen → Mail prüfen.
- **Testdaten hinterher wieder löschen** (Produktions-CRM!). Muster: über
  `createCoreServiceClient()` bzw. Supabase-Service-Key auf `archipel_leads`
  nach `external_id` filtern und entfernen.

---

## Deploy

**Repo A** (Push löst KEIN Deploy aus, muss von Hand):
```bash
cd ~/fenster-price-radar
rsync -az --delete --exclude='.git' --exclude='node_modules' --exclude='data' \
  rueckhol-automatik/ crocodile:/opt/rueckhol-automatik/
ssh crocodile "chown -R fensterradar:fensterradar /opt/rueckhol-automatik && \
  sudo -u fensterradar bash -c 'cd /opt/rueckhol-automatik && npm install --no-audit --no-fund && npm test' && \
  systemctl restart rueckhol-automatik"
curl -s https://rueckhol.schwarzwald-agent.de/api/health   # Version prüfen
```
Version in `package.json` + Kopfzeile `widget/cre.js` + `CHANGELOG.md` **synchron** halten
(es gibt einen Test, der Abweichungen findet).

**Repo B**: Push auf `master` deployt automatisch über Vercel. Wegen Kundensicht:
eigener Branch + PR, nicht direkt auf master. **Achtung:** die GitHub-Actions-CI des Repos
schlug zuletzt aus Billing-Gründen fehl (nicht wegen des Codes) — Vercel-Deploy lief trotzdem.

---

## Nebenbefunde (nicht Teil des Auftrags, aber offen)

- **`www.deutscher-fenstershop.de` liefert überall 404** (kein Redirect auf die Apex-Domain).
  Wer „www" eintippt, sieht die Seite gar nicht — also auch keine Popups. Infra/Webdesigner.
- **Fördermittel-Copy**: läuft mit sicherer Formulierung („Bares Geld beim Fenstertausch sparen").
  Der Webdesigner-Vorschlag „Bis zu 20% vom Staat geschenkt" ist bewusst **nicht** übernommen,
  bis die Zahl fachlich/rechtlich bestätigt ist (Förderhöhe + Wort „geschenkt" sind heikel).
- **11 LOW-Sicherheitsfunde** aus dem Vollaudit sind seit v1.6.2 unerledigt/ungeprüft.

---

## Agenten (können Kampagnen selbst konfigurieren)

Beide haben das `popup_*`-MCP-Werkzeug gegen `https://rueckhol.schwarzwald-agent.de/api/mcp`:
```bash
ssh jinbei    "docker exec hermes-agent-alpha hermes chat -Q -q '<auftrag>'"   # Alpha (Host Jinbei)
ssh crocodile "docker exec hermes-agent-frank hermes chat -Q -q '<auftrag>'"   # Frank
```
**Selbstberichte nie glauben** — danach immer unabhängig über die authentifizierte API prüfen
(`GET /api/campaigns?siteId=dfs` mit serverseitig gemünztem Session-Cookie auf `crocodile`).
