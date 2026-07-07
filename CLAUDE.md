# Deutscher Fenstershop (DFS) — dedizierte Session

> **Pflicht-Lektüre für jede Session/jeden Agenten, der für DFS arbeitet.** Diese Session ist die **einzige, die speziell für den Deutschen Fenstershop zuständig ist** — Bugs, Updates, neue Features, Betrieb. Wenn etwas an DFS hängt, landet es hier.

---

## 0. Wer ist DFS

Der **Deutsche Fenstershop** (`www.deutscher-fenstershop.de`) ist ein Online-Fensterhändler und der **Pilotkunde von Schwarzwald-Agent**. Er hat zwei getrennte Welten, die diese Session beide betreut:

| Welt | Wo | Was |
|---|---|---|
| **A — Fensterradar + Chatbot** | dieses Repo (`~/fenster-price-radar`, Branch `main`) | Internes Preisvergleichs-Tool, Website-Chatbot, E-Book-Freebie |
| **B — Kunden-Cockpit** | `~/Schwarzwald-Agent Fable 5` → `/kunden/dfs` (live `dfs.schwarzwald-agent.de`) | Das Kontrollzentrum, das DFS als Kunde sieht |

Vor jeder Aufgabe zuerst klären: **Welt A oder B?** Sie haben getrennte Repos, Deploys und Regeln.

---

## 1. Welt A — dieses Repo (`fenster-price-radar`)

Drei Produkte in einem Vite/React-Repo, Deploy auf Vercel (`framework: vite`, Output `dist`):

### 1a. Fensterradar (Kern)
Vergleicht **eigene Brutto-Listenpreise** gegen **Fensterblick** und **Fensterversand**, plus **Einkaufspreise vom Hersteller Eko-Okna** (Händlerportal `eko4u.com`) als Zusatzspalte. Login-gated (`middleware.js` + `api/login.js`/`api/logout.js`, HMAC-Cookie `fenster_radar_session`).
- **Datenquelle:** `data/comparison-catalog.json` steuert die In-Repo-Provider-Skripte unter `src/providers/{dfs,fensterblick,fensterversand,eko4u}/`. Diese scrapen die Live-Konfigurator-JSON-APIs der Wettbewerber und schreiben Laufdaten nach `results/` (gitignored).
- **Einkaufspreise (eko4u):** braucht `EKO4U_LOGIN` + `EKO4U_PASSWORD` (Env oder lokale `.env`, gitignored — nie ins Repo/Chat). Ohne Creds überspringt sich der Job selbst; der Radar erscheint dann ohne EK-Spalte. EK ist Zusatzinfo und zählt nie als Wettbewerber (Regel 1b in `PRICE_RADAR_QUALITY_RULES.md`). Mapping Katalogprofil→Eko4u-Konstruktor: `data/eko4u/profile-aliases.json`. Profile, die Eko-Okna nicht fertigt (Drutex, Kömmerling, Veka), haben bewusst keinen EK-Preis.
- **Generiert:** `npm run data:sync` liest die aktuellen `results/*/results.json` und baut `public/data/price-radar.json` plus `public/data/history/price-radar-YYYY-MM-DD.json`. Nur diese `public/data`-Artefakte werden committed.
- **Weekly-Update:** Primärer Trigger ist ein VPS-Cron auf Hostinger `nexus-host`. Die GitHub-Action `weekly-price-update.yml` bleibt `workflow_dispatch` als manueller Fallback. Ablauf: `npm run prices:update` (Live-Scrape aller vier Provider + Sync + `verify:prices`) → `npm run build` → Commit der `public/data`-Artefakte. Für EK-Preise im Weekly müssen `EKO4U_LOGIN`/`EKO4U_PASSWORD` auf dem VPS (bzw. als Action-Secrets) gesetzt sein.
- **Quality-Gates (hart, siehe `PRICE_RADAR_QUALITY_RULES.md`):** Wochenvergleich nie gegen Same-Day-Sync; `weeklyChange.delta` vergleicht `customerTotal` (Endpreis); Rabatte sichtbar halten; `sync-results` bricht bei unvollständigen Provider-Läufen ab, bevor neue Public-Daten veröffentlicht werden; **kein Preis-Snapshot fertig ohne `npm run prices:update` + `npm run build` grün** (`prices:update` enthält `verify:prices`).

### 1b. Website-Chatbot-MVP
Widget/Snippet für `deutscher-fenstershop.de`. **Rule-first RAG**: harte Regeln zuerst, dann lokale Wissenssuche, LLM formuliert nur aus gefundenem Kontext, bei Unsicherheit → Kontakt/Link statt raten.
- **API:** `POST /api/chatbot` (`api/chatbot.js`) · **Widget:** `public/chatbot-widget.js` · **Logik:** `src/chatbot/fenstershopChatbot.js` + `src/chatbot/kimiClient.js` · **Regelwerk:** `programmierlogik_chatbot_final_mit_anfrage_status.md` + `FENSTERSHOP_CHATBOT_PLAN.md`.
- **Out of Scope MVP (hart):** kein Zugriff auf Bestellungen, Tickets, Zahlungen, Lieferstatus, Kundendaten; keine verbindlichen Liefertermine/Zusagen; fragt nie sensible Daten ab (Bestellnr., Adresse, Zahlung, Fotos, voller Name); legt keine Reklamation automatisch an.
- **Test:** `npm run test:chatbot`.

### 1c. E-Books/Freebies
Bestehendes E-Book „Ruhiges Heimspiel" unter `public/ebooks/ruhiges-heimspiel/` (dessen `styles.css` ist das kanonische Design). **Neue E-Books nie von Hand bauen** — immer Generator `npm run ebook:make -- --config <json> --out public/ebooks/<slug>` (validiert hart, exportiert PDF, prüft Seitenzahl). Regeln: `.claude/skills/dfs-ebook/SKILL.md`. Checks: `npm run ebook:check`, `npm run ebook:pdf`.

### Start (Welt A)
```bash
npm install
npm run data:sync   # liest lokale results/ aus einem vollständigen Provider-Lauf
npm run dev         # Vite, Host 0.0.0.0
```
**Verifikation vor „fertig":** `npm run verify:prices` + `npm run build` grün; bei Chatbot zusätzlich `npm run test:chatbot`.

---

## 2. Welt B — Kunden-Cockpit `/kunden/dfs`

Lebt im Repo `~/Schwarzwald-Agent Fable 5` (Frontend `src/frontend`, Next.js App Router). **Dort gilt dessen `CLAUDE.md`** (Clay/Glas „Welt A"-Design, Service-Role-Tenant-Muster `lib/tenant/dfs-*.ts`, keine internen Begriffe/Preise im Cockpit). Diese Session greift dort nur an DFS-Themen an und folgt **strikt** dem Repo-Standard. Multi-Session-Protokoll dort beachten (sync → commit+push pro Chunk → re-validieren vor Delete).

---

## 3. Sicherheit (Pflicht, beide Welten)
- **Secrets nur aus Env**, nie in Code/Repo/Chat/Log. Welt A: `FENSTER_RADAR_PASSWORD` + `FENSTER_RADAR_AUTH_SECRET` (Radar-Login), LLM-Key des Chatbots (`kimiClient`). Welt B: siehe Schwarzwald-Repo.
- Chatbot **darf nie** sensible Kundendaten abfragen oder Backend-Zugriff vortäuschen (siehe 1b Out-of-Scope).
- Kein roher HTML-Inject ins Widget ohne Escape. Eingaben an Systemgrenzen validieren.

## 4. Kundensicht-Regeln
Keine internen Begriffe in allem, was DFS oder dessen Endkunden sehen (kein Vercel, Supabase, Hermes, „Provider", „Server"). Im Chatbot: ruhig, präzise, ehrlich; bei Unsicherheit eskalieren statt erfinden.

## 5. Git & Arbeitsweise
- **Welt A:** Branch `main`. Vor Arbeit `git fetch && git merge --ff-only origin/main`. Nach jedem sicheren Chunk committen + pushen. Commit-Format `<type>(scope): kurz` (Deutsch ok). **Push/Deploy nur mit Elvis-Go** (Push = Vercel-Deploy).
- **Welt B:** Multi-Session-Repo — dessen Protokoll gilt, nie dieselben Dateien wie eine andere aktive Session.
- **Vor jedem Löschen** re-validieren (HEAD + Backlink-`grep`). Nie destruktiv (kein DB-/Secret-Vernichten, `git rm`/trash statt unwiderruflich).

## 6. Telegram-Agent (zweiter DFS-Agent) — anzubinden
Elvis hat einen separaten DFS-Agenten auf Telegram. Anbindung an diese Session ist offen — Mechanik vor dem Bauen mit Elvis klären (Bot-Token? Soll Telegram den Chatbot/`/api/chatbot` triggern? Reine Benachrichtigungs-/Steuerbrücke?). **Token/Zugänge nie in den Chat** — über Env/Codex. Erst Konzept, dann bauen.

## 7. Verifikation, bevor „fertig" gesagt wird
- Welt A: `npm run verify:prices` + `npm run build` grün; Chatbot-Änderung: `npm run test:chatbot` grün.
- Welt B: `node node_modules/typescript/bin/tsc --noEmit` (in `src/frontend`) grün; Cockpit klickfest.
- Nie „läuft/fertig" ohne den Befehl ausgeführt + Ausgabe gesehen zu haben.

---
**Kurz:** Welt A = `fenster-price-radar` (Radar/Chatbot/Ebook, harte Preis-Gates, login-gated, Vercel) · Welt B = Cockpit `/kunden/dfs` (Schwarzwald-Repo-Standard) · Secrets nur Env · Chatbot nie sensibel/Backend · Push nur mit Go · verify grün vor „fertig".
