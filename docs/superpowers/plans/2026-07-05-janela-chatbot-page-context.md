# Janela Rebrand + Seiten-Kontext Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chatbot-Widget tritt als "Janela" auf und passt Begrüßung/Vorschlags-Chips an die aktuelle Shop-Seite an, plus eine Testseite die alle Seiten-Kontexte nebeneinander zeigt.

**Architecture:** Reine Client-Änderung in `public/chatbot-widget.js` (Pfad → Kontext-Lookup-Tabelle, kein Netzwerk-Call, kein Backend-Vertrag geändert). Ein-Zeilen-Rebrand in `api/chatbot.js`. Neue statische Testseite `public/janela-chatbot-test.html`, die das Widget mehrfach in isolierten `<iframe>`s mit unterschiedlichem `data-page` einbindet.

**Tech Stack:** Vanilla JS (kein Build-Schritt für `public/*`), Node `assert`-Testskripte (`node tests/*.mjs`), Vercel Rewrites.

Spec: `docs/superpowers/specs/2026-07-05-janela-chatbot-page-context-design.md`

---

### Task 1: Branding — Widget-Titel + API-Healthcheck

**Files:**
- Modify: `public/chatbot-widget.js:6`
- Modify: `api/chatbot.js:27`

- [ ] **Step 1: Widget-Default-Titel auf Janela ändern**

In `public/chatbot-widget.js`, Zeile 6:

```js
// vorher
const title = currentScript?.dataset.title || 'Fenstershop Hilfe';
// nachher
const title = currentScript?.dataset.title || 'Janela';
```

- [ ] **Step 2: API-Healthcheck-Namen ändern**

In `api/chatbot.js`, Zeile 27:

```js
// vorher
if (req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'fenstershop-chatbot', mode: 'rule-first-rag-mvp' });
// nachher
if (req.method === 'GET') return sendJson(res, 200, { ok: true, service: 'janela', mode: 'rule-first-rag-mvp' });
```

- [ ] **Step 3: Syntax-Check laufen lassen**

Run: `node --check public/chatbot-widget.js && node --check api/chatbot.js`
Expected: kein Output, Exit-Code 0.

- [ ] **Step 4: Commit**

```bash
git add public/chatbot-widget.js api/chatbot.js
git commit -m "feat(chatbot): Widget/API auf Janela umbenennen"
```

---

### Task 2: Seiten-Kontext-Logik im Widget

**Files:**
- Modify: `public/chatbot-widget.js:8-9` (neue Konstanten direkt danach einfügen)
- Modify: `public/chatbot-widget.js:47-53` (`addChips`)
- Modify: `public/chatbot-widget.js:64` (`button.onclick`)
- Modify: `README.md:53-61` (Snippet-Beispiel + `data-page` dokumentieren)

- [ ] **Step 1: Kontext-Tabelle + `contextForPath` einfügen**

In `public/chatbot-widget.js`, direkt nach der bestehenden Zeile

```js
  if (!localStorage.getItem(sessionKey)) localStorage.setItem(sessionKey, crypto.randomUUID?.() || String(Date.now()));
```

einfügen:

```js
  const PAGE_CONTEXTS = [
    { key: 'konfigurator', match: /konfigurator/, greeting: 'Hallo, ich bin Janela. Ich sehe, Sie sind gerade im Konfigurator – ich helfe bei der Konfiguration, technischen Begriffen oder leite an die richtige Abteilung weiter.', chips: ['Hilfe beim Konfigurator', 'Uw-Wert erklären', 'Technische Frage stellen'] },
    { key: 'versand', match: /versand|lieferzeit/, greeting: 'Hallo, ich bin Janela. Für Fragen rund um Lieferung und Versand bin ich hier richtig.', chips: ['Lieferzeit erfahren', 'Lieferung heute?', 'Lieferadresse ändern'] },
    { key: 'reklamation', match: /reklamation/, greeting: 'Hallo, ich bin Janela. Bei Reklamationen helfe ich Ihnen zum passenden Formular.', chips: ['Reklamation melden', 'Transportschaden melden'] },
    { key: 'kontakt', match: /kontakt|anfrage|callback/, greeting: 'Hallo, ich bin Janela. Ich helfe Ihnen, die Anfrage auf den richtigen Weg zu bringen.', chips: ['Anfrage senden', 'Montage-Frage'] },
    { key: 'wissen', match: /wissenswertes|fensterbegriffe|erklaervideo|profilschnitte/, greeting: 'Hallo, ich bin Janela. Ich erkläre gerne Fachbegriffe und technische Fragen.', chips: ['Fachbegriff erklären', 'Technische Frage stellen'] },
  ];
  const DEFAULT_CONTEXT = { key: 'standard', greeting: 'Hallo, ich bin Janela! Ich helfe bei allgemeinen Fragen zu Lieferung, Reklamation, Konfigurator, Montage, Aufmaß und technischen Begriffen.', chips: ['Lieferzeit?', 'Bestellstatus', 'Transportschaden', 'Konfigurator Hilfe', 'Uw-Wert erklären'] };

  // ponytail: einfache Teilstring-Suche reicht für die bekannten DFS-URLs; kein Router nötig.
  // Kein Node-Unit-Test dafür (Widget ist DOM-only Single-File-Embed, siehe tests/chatbot-smoke.mjs-Kommentar) —
  // verifiziert wird über die 6 Kacheln in public/janela-chatbot-test.html im Browser (Task 3/4).
  function contextForPath(path) {
    const p = String(path || '').toLowerCase();
    return PAGE_CONTEXTS.find((c) => c.match.test(p)) || DEFAULT_CONTEXT;
  }
  const pageContext = contextForPath(currentScript?.dataset.page || window.location.pathname);
```

- [ ] **Step 2: `addChips` parametrisieren**

In `public/chatbot-widget.js`, bestehende Funktion ersetzen:

```js
// vorher
function addChips(){
  const row=document.createElement('div'); row.className='dfs-chiprow';
  ['Lieferzeit?','Bestellstatus','Transportschaden','Konfigurator Hilfe','Uw-Wert erklären'].forEach(text=>{
    const chip=document.createElement('button'); chip.type='button'; chip.className='dfs-chip'; chip.textContent=text; chip.onclick=()=>ask(text); row.appendChild(chip);
  });
  log.appendChild(row);
}
// nachher
function addChips(list){
  const row=document.createElement('div'); row.className='dfs-chiprow';
  list.forEach(text=>{
    const chip=document.createElement('button'); chip.type='button'; chip.className='dfs-chip'; chip.textContent=text; chip.onclick=()=>ask(text); row.appendChild(chip);
  });
  log.appendChild(row);
}
```

- [ ] **Step 3: Begrüßung + Chips aus `pageContext` ziehen**

In `public/chatbot-widget.js`, Zeile mit `button.onclick`:

```js
// vorher
button.onclick=()=>{panel.classList.add('open'); if(!log.dataset.started){addMessage('bot','Hallo! Ich helfe bei allgemeinen Fragen zu Lieferung, Reklamation, Konfigurator, Montage, Aufmaß und technischen Begriffen.'); addChips(); log.dataset.started='1';}};
// nachher
button.onclick=()=>{panel.classList.add('open'); if(!log.dataset.started){addMessage('bot', pageContext.greeting); addChips(pageContext.chips); log.dataset.started='1';}};
```

- [ ] **Step 4: README-Snippet aktualisieren**

In `README.md`, Zeilen 55-60 ersetzen:

```html
<!-- vorher -->
<script
  src="https://YOUR_DEPLOYMENT/chatbot-widget.js"
  data-title="Fenstershop Hilfe"
  data-api-url="https://YOUR_DEPLOYMENT"
></script>
<!-- nachher -->
<script
  src="https://YOUR_DEPLOYMENT/chatbot-widget.js"
  data-title="Janela"
  data-api-url="https://YOUR_DEPLOYMENT"
  data-page="/konfigurator/fenster"
></script>
```

Direkt danach einen Satz ergänzen: `data-page` ist optional — ohne Angabe nutzt das Widget `window.location.pathname`, um Begrüßung und Vorschlags-Chips an die aktuelle Seite anzupassen.

- [ ] **Step 5: Syntax-Check + bestehende Chatbot-Tests laufen lassen**

Run: `node --check public/chatbot-widget.js && npm run test:chatbot`
Expected: `chatbot-smoke ok`, keine Fehler (Backend-Logik unverändert, Tests dürfen nicht brechen).

- [ ] **Step 6: Commit**

```bash
git add public/chatbot-widget.js README.md
git commit -m "feat(chatbot): Seiten-Kontext für Begrüßung und Vorschlags-Chips"
```

---

### Task 3: Testseite für Anselm

**Files:**
- Create: `public/janela-chatbot-test.html`
- Modify: `vercel.json:55` (Rewrite-Ausnahme)

- [ ] **Step 1: Testseite erstellen**

Create `public/janela-chatbot-test.html`:

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Janela — Testseite Seiten-Kontext</title>
<style>
  :root { --bg:#f7f9fc; --ink:#18212f; --muted:#667089; --line:#d7dde8; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5; }
  header { background: #fff; border-bottom: 1px solid var(--line); padding: 24px; }
  header h1 { margin: 0 0 6px; font-size: 24px; }
  header p { margin: 0; color: var(--muted); max-width: 760px; }
  main { max-width: 1200px; margin: 0 auto; padding: 32px 24px 80px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .card .label { padding: 12px 16px; border-bottom: 1px solid var(--line); font-weight: 700; font-size: 14px; }
  .card .label small { display: block; font-weight: 400; color: var(--muted); margin-top: 2px; }
  .card iframe { display: block; width: 100%; height: 520px; border: 0; background: repeating-linear-gradient(45deg, #fbfcfe, #fbfcfe 10px, #f2f4f8 10px, #f2f4f8 20px); }
</style>
</head>
<body>
<header>
  <p style="margin:0 0 10px;font-weight:700;color:#004b93;text-transform:uppercase;font-size:12px;letter-spacing:.04em">Testseite — nicht für Kunden verlinken</p>
  <h1>Janela — Seiten-Kontext im Chatbot</h1>
  <p>Jede Kachel simuliert eine andere Shop-Seite über <code>data-page</code>. Begrüßung und Vorschlags-Chips passen sich automatisch an — die Antwortlogik im Hintergrund ist für alle Seiten identisch.</p>
</header>
<main>
  <div class="grid" id="cards"></div>
</main>
<script>
  var CONTEXTS = [
    { label: 'Startseite (Standard)', page: '/' },
    { label: 'Konfigurator', page: '/konfigurator/fenster' },
    { label: 'Versand & Lieferzeiten', page: '/fenster#versand-und-lieferzeiten' },
    { label: 'Reklamation', page: '/system/reklamation' },
    { label: 'Kontakt / Anfrage', page: '/callback' },
    { label: 'Wissenswertes', page: '/wissenswertes' }
  ];
  var origin = location.origin;
  var grid = document.getElementById('cards');
  CONTEXTS.forEach(function (ctx) {
    var card = document.createElement('div');
    card.className = 'card';
    var label = document.createElement('div');
    label.className = 'label';
    label.textContent = ctx.label;
    var small = document.createElement('small');
    small.textContent = ctx.page;
    label.appendChild(small);
    var iframe = document.createElement('iframe');
    iframe.srcdoc = '<!doctype html><html><head></head><body><script src="' + origin + '/chatbot-widget.js" data-api-url="' + origin + '" data-page="' + ctx.page + '"><' + '/script></body></html>';
    card.appendChild(label);
    card.appendChild(iframe);
    grid.appendChild(card);
  });
</script>
</body>
</html>
```

- [ ] **Step 2: Vercel-Rewrite-Ausnahme ergänzen**

In `vercel.json`, `rewrites[0].source`:

```json
// vorher
"source": "/((?!data/|assets/|api/|reports/|ebooks/|aufmass\\.html|rueckhol-test\\.html|rueckhol-popups-test\\.html).*)",
// nachher
"source": "/((?!data/|assets/|api/|reports/|ebooks/|aufmass\\.html|rueckhol-test\\.html|rueckhol-popups-test\\.html|janela-chatbot-test\\.html).*)",
```

- [ ] **Step 3: JSON-Syntax prüfen**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json ok')"`
Expected: `vercel.json ok`

- [ ] **Step 4: Commit**

```bash
git add public/janela-chatbot-test.html vercel.json
git commit -m "feat(chatbot): Testseite für Janela-Seiten-Kontext"
```

---

### Task 4: Verifikation

**Files:** keine (nur Prüfung)

- [ ] **Step 1: Vollen Testlauf ausführen**

Run: `npm run test:chatbot`
Expected: `chatbot-smoke ok` und `config-links ok` (Backend-Guardrails unverändert grün).

- [ ] **Step 2: Build-Check**

Run: `npm run build`
Expected: Build läuft durch ohne Fehler (bestätigt, dass `public/*`-Neuzugänge den Vite-Build nicht stören).

- [ ] **Step 3: Manueller Browser-Check**

`npm run dev` starten (oder Preview-Tool), `/janela-chatbot-test.html` öffnen. Für mindestens 3 Kacheln (Standard, Konfigurator, Reklamation): Chat-Button öffnen, Begrüßungstext + Chips gegen die Tabelle in der Spec prüfen, eine Chip-Frage anklicken und prüfen dass eine Antwort mit Kontakt/Link zurückkommt (Backend unverändert).

- [ ] **Step 4: Kein Commit nötig**

Nur bei Fehlern: entsprechenden Task-Commit korrigieren und neu committen. Kein Push (Push/Deploy nur mit Elvis-Go, siehe `CLAUDE.md`).
