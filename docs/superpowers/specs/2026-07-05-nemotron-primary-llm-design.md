# Nemotron als primäres LLM, Kimi/Moonshot als Fallback

Stand: 2026-07-05

## Ausgangslage

`src/chatbot/kimiClient.js` poliert RAG-Antworten des Janela-Chatbots über Moonshot/Kimi (`moonshot-v1-8k`), gesteuert über `answerFenstershopChatbotWithLlm` in `src/chatbot/fenstershopChatbot.js`. Elvis will zusätzlich ein NVIDIA-Nemotron-Modell (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, über die OpenAI-kompatible NVIDIA-NIM-API) anbinden — als primäres Polier-LLM, mit Kimi als Fallback, falls Nemotron nicht konfiguriert ist, fehlschlägt oder eine unsichere Antwort liefert.

`NVIDIA_API_KEY` ist bereits in Vercel (Production) gesetzt.

## Ziel

1. Neuer Provider-Client `src/chatbot/nemotronClient.js`, gleicher Vertrag wie `polishFenstershopAnswer` aus `kimiClient.js`: `({message, draft, knowledge, env}) => Promise<{answer, model} | null>`, wirft bei Hard-Failure.
2. `answerFenstershopChatbotWithLlm` versucht Provider der Reihe nach: **Nemotron → Kimi → Regel-Draft** (heutiges Verhalten als Endstufe unverändert).
3. Bestehende Sicherheits-/Formatregeln (`answerStillSafe`, `withRequiredRefs`, Guardrail-Intents) bleiben provider-unabhängig und unverändert — gelten für beide Provider gleich.
4. Tests decken den Fallback-Pfad ab (Nemotron down → Kimi übernimmt → `llm.provider === 'moonshot'`).

## Out of Scope

- Keine Änderung an der Regel-Engine/Intent-Erkennung in `fenstershopChatbot.js`.
- Kein Thinking-Modus (`enable_thinking`) standardmäßig aktiv — nur Text-Antwort, kein Reasoning-Trace an den Nutzer.
- Kein konfigurierbares Provider-Ranking (kein Env-Flag für Reihenfolge) — Reihenfolge ist fest Nemotron→Kimi, YAGNI.
- Kein Caching/Retry-Mechanismus über das hinaus, was Kimi heute schon macht (Timeout + einmaliger Versuch pro Provider).

## Nemotron-Client (`src/chatbot/nemotronClient.js`)

Struktur analog `kimiClient.js`:

- Env: `NVIDIA_API_KEY` (Key), `FENSTERSHOP_NEMOTRON_MODEL` (Default `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`), `FENSTERSHOP_NEMOTRON_TIMEOUT_MS` (Default `20000`), `FENSTERSHOP_LLM_ENABLED` (geteilter Kill-Switch, `'0'` deaktiviert beide Provider — gleiche Prüfung wie in `kimiClient.js`).
- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`.
- Request-Body: `{ model, messages: [{role:'user', content: prompt}], temperature: 0.6, top_p: 0.95, max_tokens: 1200, stream: false }`. Kein `enable_thinking`/`reasoning_budget` (Default des Modells ohne `extra_body` — kein Reasoning-Trace nötig für kurze Kundenantworten).
- Kein `response_format: json_object` (NIM unterstützt das nicht zuverlässig für jedes Modell) — Antwort wird als **Klartext** aus `completion.choices[0].message.content` genommen, getrimmt, auf Leerstring/Überlänge (>700 Zeichen, gleiche Grenze wie Kimi) geprüft.
- Prompt: gleiche Regeln wie Kimi (Sie-Form, keine erfundenen Liefertermine/Status, Kontakte/Links exakt erhalten, max. 360 Zeichen / 2-3 Sätze), aber als Klartext-Anweisung statt JSON-Anweisung formuliert (da kein JSON-Modus). Die **Regeln selbst** werden in eine gemeinsame Konstante `LLM_ANSWER_RULES` (neue kleine Datei `src/chatbot/llmPromptRules.js`) ausgelagert, damit Kimi- und Nemotron-Prompt nicht auseinanderdriften.

## Fallback-Kette in `fenstershopChatbot.js`

```js
const LLM_PROVIDERS = [
  { name: 'nemotron', polish: polishFenstershopAnswerNemotron },
  { name: 'moonshot', polish: polishFenstershopAnswer },
];
```

`answerFenstershopChatbotWithLlm` iteriert `LLM_PROVIDERS`: pro Provider `try { polish(...) }`, bei `null` (nicht konfiguriert) oder unsicherer Antwort (`!answerStillSafe`) → nächster Provider; bei Exception → nächster Provider; nach allen Fehlschlägen → Draft mit `llm: { used: false, reason: 'all_providers_failed_or_unconfigured' }`. Bei Erfolg: `llm: { used: true, provider: <name>, model: <model> }` (gleiche Form wie heute, nur `provider` jetzt auch `'nemotron'` statt nur `'moonshot'`).

## Testing

- `tests/chatbot-smoke.mjs`: Fetch-Mock erweitern um `integrate.api.nvidia.com` (liefert eine Testantwort als Klartext-Content, kein JSON).
- Neuer Testfall: Nemotron-Mock wirft/liefert leer → Kimi-Mock greift → `llm.provider === 'moonshot'`.
- Neuer Testfall: Nemotron-Mock liefert normal → `llm.provider === 'nemotron'`, Kimi-Mock wird nicht aufgerufen (Call-Count prüfen).
- Bestehende Guardrail-Assertions (`order_status`, `payment_status` etc. bleiben `llm: null`, da `LLM_SAFE_INTENTS` unverändert) bleiben unverändert grün.
- `npm run test:chatbot` muss grün bleiben.

## Sicherheit

- `NVIDIA_API_KEY` ausschließlich aus `process.env`, nie im Code/Repo (bereits in Vercel gesetzt, außerhalb dieser Session).
- Kein Logging von Rohantworten oder Keys.
- Gleiche PII-/Sicherheitsschranken wie Kimi: `answerStillSafe` läuft für jede Provider-Antwort, bevor sie den Draft ersetzt.
