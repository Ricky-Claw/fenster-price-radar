# Nemotron Primary LLM + Kimi Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Janela-Chatbot poliert RAG-Antworten primär über NVIDIA Nemotron, fällt bei Fehlschlag/fehlender Config/unsicherer Antwort automatisch auf Kimi/Moonshot zurück, sonst auf den bestehenden Regel-Draft.

**Architecture:** Neuer Provider-Client `src/chatbot/nemotronClient.js` mit identischem Vertrag wie `kimiClient.js`'s `polishFenstershopAnswer`. `answerFenstershopChatbotWithLlm` in `src/chatbot/fenstershopChatbot.js` iteriert eine feste Provider-Liste `[nemotron, moonshot]`. Gemeinsame Prompt-Regeln in `src/chatbot/llmPromptRules.js`, von beiden Clients genutzt.

**Tech Stack:** Vanilla Node ESM, `fetch` + `AbortController` (wie bestehender Kimi-Client), Node `assert`-Testskript (`tests/chatbot-smoke.mjs`), keine neuen Dependencies.

Spec: `docs/superpowers/specs/2026-07-05-nemotron-primary-llm-design.md`

---

### Task 1: Gemeinsame Prompt-Regeln extrahieren (Refactor, kein Verhaltenswechsel)

**Files:**
- Create: `src/chatbot/llmPromptRules.js`
- Modify: `src/chatbot/kimiClient.js:16-24`

- [ ] **Step 1: Regel-Konstante anlegen**

Create `src/chatbot/llmPromptRules.js`:

```js
export const LLM_ANSWER_RULES = `WICHTIGE REGELN:
- Nutze ausschließlich den DRAFT und die WISSENSQUELLEN.
- Erfinde keine Liefertermine, Bestellstatus, Zahlungsstatus, Ticketstatus oder technischen Einzelwerte.
- Frage nicht nach Bestellnummer, Adresse, Zahlungsdaten, Fotos oder vollständigem Namen.
- Wenn der DRAFT einen Kontakt/Link nennt, muss dieser erhalten bleiben.
- Maximal 360 Zeichen. 2-3 kurze Sätze.
- Verwende Sie/Ihnen, niemals du/dir.
- Wenn ein Link/Kontakt im Draft steht, nenne ihn exakt.`;
```

- [ ] **Step 2: Kimi-Prompt auf die Konstante umstellen**

In `src/chatbot/kimiClient.js`, ganz oben den Import ergänzen:

```js
// vorher (Zeile 1)
const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';
// nachher
import { LLM_ANSWER_RULES } from './llmPromptRules.js';

const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';
```

Dann den Prompt-Body ersetzen:

```js
// vorher
  const prompt = `Du bist der Hilfechat vom Deutschen Fenstershop. Formuliere eine kurze, freundliche deutsche Antwort.

WICHTIGE REGELN:
- Nutze ausschließlich den DRAFT und die WISSENSQUELLEN.
- Erfinde keine Liefertermine, Bestellstatus, Zahlungsstatus, Ticketstatus oder technischen Einzelwerte.
- Frage nicht nach Bestellnummer, Adresse, Zahlungsdaten, Fotos oder vollständigem Namen.
- Wenn der DRAFT einen Kontakt/Link nennt, muss dieser erhalten bleiben.
- Maximal 360 Zeichen. 2-3 kurze Sätze.
- Verwende Sie/Ihnen, niemals du/dir.
- Wenn ein Link/Kontakt im Draft steht, nenne ihn exakt.
- Gib nur valides JSON zurück: {"answer":"..."}

Nutzerfrage: ${message}
Intent: ${draft.intent}
Draft-Antwort: ${draft.answer}
Links: ${JSON.stringify(draft.links || [])}
Kontakte: ${JSON.stringify(draft.contacts || [])}
Wissensquellen: ${JSON.stringify(knowledge.map((chunk) => ({ title: chunk.title, text: chunk.text.slice(0, 900) })))}
`;
// nachher
  const prompt = `Du bist der Hilfechat vom Deutschen Fenstershop. Formuliere eine kurze, freundliche deutsche Antwort.

${LLM_ANSWER_RULES}
- Gib nur valides JSON zurück: {"answer":"..."}

Nutzerfrage: ${message}
Intent: ${draft.intent}
Draft-Antwort: ${draft.answer}
Links: ${JSON.stringify(draft.links || [])}
Kontakte: ${JSON.stringify(draft.contacts || [])}
Wissensquellen: ${JSON.stringify(knowledge.map((chunk) => ({ title: chunk.title, text: chunk.text.slice(0, 900) })))}
`;
```

- [ ] **Step 3: Bestehende Tests laufen lassen (Regression-Check)**

Run: `npm run test:chatbot`
Expected: `chatbot-smoke ok`, `config-links ok` — unverändert grün (Prompt-Text ist identisch, nur DRY'd, kein Verhaltenswechsel).

- [ ] **Step 4: Commit**

```bash
git add src/chatbot/llmPromptRules.js src/chatbot/kimiClient.js
git commit -m "refactor(chatbot): gemeinsame LLM-Prompt-Regeln extrahiert"
```

---

### Task 2: Failing Tests für Nemotron-primär + Kimi-Fallback schreiben (RED)

**Files:**
- Modify: `tests/chatbot-smoke.mjs`

- [ ] **Step 1: Fetch-Mock um NVIDIA-Branch erweitern**

In `tests/chatbot-smoke.mjs`, den bestehenden Mock ersetzen:

```js
// vorher
globalThis.fetch = async (url) => {
  if (String(url).includes('api.moonshot.ai')) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Kurz poliert aus Atlas.' }) } }] }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};
// nachher
globalThis.fetch = async (url) => {
  if (String(url).includes('integrate.api.nvidia.com')) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Nemotron-Antwort direkt aus Atlas.' } }] }) };
  }
  if (String(url).includes('api.moonshot.ai')) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Kurz poliert aus Atlas.' }) } }] }) };
  }
  throw new Error(`unexpected fetch ${url}`);
};
```

- [ ] **Step 2: Bestehende Kimi-Assertion um Provider-Check ergänzen**

```js
// vorher
const llmAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { KIMI_API_KEY: 'test', FENSTERSHOP_LLM_MODEL: 'kimi-test' } });
assert.equal(llmAnswer.llm.used, true);
assert.match(llmAnswer.answer, /Kurz poliert aus Atlas\./);
assert.match(llmAnswer.answer, /https:\/\/deutscher-fenstershop\.de\/fensterbegriffe/);
// nachher
const llmAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { KIMI_API_KEY: 'test', FENSTERSHOP_LLM_MODEL: 'kimi-test' } });
assert.equal(llmAnswer.llm.used, true);
assert.equal(llmAnswer.llm.provider, 'moonshot');
assert.match(llmAnswer.answer, /Kurz poliert aus Atlas\./);
assert.match(llmAnswer.answer, /https:\/\/deutscher-fenstershop\.de\/fensterbegriffe/);

const nemotronAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { NVIDIA_API_KEY: 'test', KIMI_API_KEY: 'test' } });
assert.equal(nemotronAnswer.llm.used, true);
assert.equal(nemotronAnswer.llm.provider, 'nemotron');
assert.match(nemotronAnswer.answer, /Nemotron-Antwort direkt aus Atlas\./);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('integrate.api.nvidia.com')) return { ok: false, status: 500 };
  if (String(url).includes('api.moonshot.ai')) return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: 'Kimi rettet die Antwort.' }) } }] }) };
  throw new Error(`unexpected fetch ${url}`);
};
const fallbackAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: { NVIDIA_API_KEY: 'test', KIMI_API_KEY: 'test' } });
assert.equal(fallbackAnswer.llm.used, true);
assert.equal(fallbackAnswer.llm.provider, 'moonshot');
assert.match(fallbackAnswer.answer, /Kimi rettet die Antwort\./);
globalThis.fetch = originalFetch;

const noProviderAnswer = await answerFenstershopChatbotWithLlm({ message: 'Was bedeutet Ug Wert bei Fenstern?', env: {} });
assert.equal(noProviderAnswer.llm.used, false);
assert.equal(noProviderAnswer.llm.reason, 'all_providers_failed_or_unconfigured');
```

- [ ] **Step 3: Tests laufen lassen — müssen fehlschlagen**

Run: `npm run test:chatbot`
Expected: FAIL — `nemotronAnswer.llm.provider` ist `'moonshot'` statt `'nemotron'` (es gibt noch keinen Nemotron-Client, `answerFenstershopChatbotWithLlm` kennt nur Kimi). Das bestätigt: Test testet die neue Funktionalität, nicht Zufall.

---

### Task 3: Nemotron-Client implementieren (GREEN, Teil 1)

**Files:**
- Create: `src/chatbot/nemotronClient.js`

- [ ] **Step 1: Client schreiben**

Create `src/chatbot/nemotronClient.js`:

```js
import { LLM_ANSWER_RULES } from './llmPromptRules.js';

const NEMOTRON_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

function nemotronApiKey(env = process.env) {
  return env.NVIDIA_API_KEY || '';
}

export async function polishFenstershopAnswerNemotron({ message, draft, knowledge = [], env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.FENSTERSHOP_LLM_ENABLED === '0') return null;
  const apiKey = nemotronApiKey(env);
  if (!apiKey || typeof fetchImpl !== 'function') return null;
  const prompt = `Du bist der Hilfechat vom Deutschen Fenstershop. Formuliere eine kurze, freundliche deutsche Antwort als reinen Text (kein JSON, keine Anführungszeichen drumherum).

${LLM_ANSWER_RULES}

Nutzerfrage: ${message}
Intent: ${draft.intent}
Draft-Antwort: ${draft.answer}
Links: ${JSON.stringify(draft.links || [])}
Kontakte: ${JSON.stringify(draft.contacts || [])}
Wissensquellen: ${JSON.stringify(knowledge.map((chunk) => ({ title: chunk.title, text: chunk.text.slice(0, 900) })))}
`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.FENSTERSHOP_NEMOTRON_TIMEOUT_MS || 20000));
  try {
    const response = await fetchImpl(NEMOTRON_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.FENSTERSHOP_NEMOTRON_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 1200,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`nemotron_failed_${response.status}`);
    const data = await response.json();
    const answer = String(data.choices?.[0]?.message?.content || '').trim();
    if (!answer || answer.length > 700) return null;
    return { answer, model: env.FENSTERSHOP_NEMOTRON_MODEL || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Syntax-Check**

Run: `node --check src/chatbot/nemotronClient.js`
Expected: kein Output, Exit-Code 0.

---

### Task 4: Provider-Fallback-Kette verdrahten (GREEN, Teil 2)

**Files:**
- Modify: `src/chatbot/fenstershopChatbot.js:1-2` (Import)
- Modify: `src/chatbot/fenstershopChatbot.js:302-313` (`answerFenstershopChatbotWithLlm`)

- [ ] **Step 1: Import ergänzen**

```js
// vorher (Zeile 1-2)
import { readFileSync } from 'node:fs';
import { polishFenstershopAnswer } from './kimiClient.js';
// nachher
import { readFileSync } from 'node:fs';
import { polishFenstershopAnswer } from './kimiClient.js';
import { polishFenstershopAnswerNemotron } from './nemotronClient.js';
```

- [ ] **Step 2: `answerFenstershopChatbotWithLlm` auf Provider-Schleife umstellen**

```js
// vorher
export async function answerFenstershopChatbotWithLlm({ message = '', env = process.env } = {}) {
  const draft = answerFenstershopChatbot({ message });
  if (mustKeepGuardrailDraft(draft)) return draft;
  const knowledge = retrieveFenstershopKnowledge(message, { limit: 3 });
  try {
    const polished = await polishFenstershopAnswer({ message, draft, knowledge, env });
    if (!answerStillSafe(polished, draft)) return { ...draft, llm: { used: false, reason: 'safety_fallback' } };
    return { ...draft, answer: withRequiredRefs(polished.answer, draft), llm: { used: true, provider: 'moonshot', model: polished.model } };
  } catch (error) {
    return { ...draft, llm: { used: false, reason: error.message || 'llm_failed' } };
  }
}
// nachher
const LLM_PROVIDERS = [
  { name: 'nemotron', polish: polishFenstershopAnswerNemotron },
  { name: 'moonshot', polish: polishFenstershopAnswer },
];

export async function answerFenstershopChatbotWithLlm({ message = '', env = process.env } = {}) {
  const draft = answerFenstershopChatbot({ message });
  if (mustKeepGuardrailDraft(draft)) return draft;
  const knowledge = retrieveFenstershopKnowledge(message, { limit: 3 });
  for (const provider of LLM_PROVIDERS) {
    let polished;
    try {
      polished = await provider.polish({ message, draft, knowledge, env });
    } catch {
      continue;
    }
    if (!polished || !answerStillSafe(polished, draft)) continue;
    return { ...draft, answer: withRequiredRefs(polished.answer, draft), llm: { used: true, provider: provider.name, model: polished.model } };
  }
  return { ...draft, llm: { used: false, reason: 'all_providers_failed_or_unconfigured' } };
}
```

- [ ] **Step 3: Tests laufen lassen — müssen jetzt grün sein**

Run: `npm run test:chatbot`
Expected: `chatbot-smoke ok`, `config-links ok`.

- [ ] **Step 4: Commit**

```bash
git add src/chatbot/nemotronClient.js src/chatbot/fenstershopChatbot.js tests/chatbot-smoke.mjs
git commit -m "feat(chatbot): Nemotron als primäres LLM mit Kimi-Fallback"
```

---

### Task 5: Doku + Gesamtverifikation

**Files:**
- Modify: `README.md` (Env-Var-Hinweis ergänzen, gleicher Abschnitt wie Chatbot-MVP)

- [ ] **Step 1: README um Env-Var-Hinweis ergänzen**

In `README.md`, nach der Zeile `MVP-Regel: harte Kontakt-/Eskalationslogik zuerst, ...` (im Fenstershop-Chatbot-Abschnitt) einen Satz ergänzen:

```markdown
LLM-Polierung: primär NVIDIA Nemotron (`NVIDIA_API_KEY`, Modell via `FENSTERSHOP_NEMOTRON_MODEL`), Fallback Kimi/Moonshot (`KIMI_API_KEY`). Ohne Keys bleibt die reine Regelantwort bestehen.
```

- [ ] **Step 2: Vollen Testlauf + Build**

Run: `npm run test:chatbot && npm run build`
Expected: `chatbot-smoke ok`, `config-links ok`, `vite build` erfolgreich ohne Fehler.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(chatbot): Nemotron/Kimi Env-Vars dokumentiert"
```

---

## Self-Review Notes

- Spec-Abdeckung: Nemotron-Client ✓ (Task 3), Fallback-Kette ✓ (Task 4), gemeinsame Prompt-Regeln ✓ (Task 1), Tests für Fallback-Pfad ✓ (Task 2), Doku ✓ (Task 5). Kein Punkt aus der Spec ohne Task.
- Typkonsistenz geprüft: `polishFenstershopAnswerNemotron({message, draft, knowledge, env, fetchImpl})` exakt gleiche Signatur wie `polishFenstershopAnswer`; `LLM_PROVIDERS[].polish` ruft beide identisch auf.
- Kein Platzhalter — jeder Schritt enthält vollständigen Code.
