// portable module: no imports from radar internals. In the DFS repo, move to lib/aufmass/.

import { AUFMASS_FIELDS } from './schema.js';

const NEMOTRON_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';
const NEMOTRON_DEFAULT_MODEL = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
const KIMI_DEFAULT_MODEL = 'moonshot-v1-8k';
const NON_GERMAN_ERROR_SUFFIX = '_non_german';

const NON_LATIN_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u1100-\u11FF\u0400-\u04FF\u0500-\u052F\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0E00-\u0E7F\u3000-\u303F\uFF00-\uFFEF]/;

const FIELD_DESCRIPTIONS = Object.freeze({
  raum: 'Raum/Position. Kürzel/Dialekt ausschreiben ("Wohnzi"->"Wohnzimmer", "Schlafzi"->"Schlafzimmer", "Bad", "Küche"). "" wenn nicht genannt.',
  anzahl: 'Stückzahl. "zwei mal"/"3 Stück" -> anzahl erhöhen, NICHT duplizieren.',
  breiteMm: 'Breite in Millimetern. "1,20 m" / "ein Meter zwanzig" / "120 cm" -> 1200.',
  hoeheMm: 'Höhe in Millimetern, gleiche Umrechnung.',
  oeffnungsart: '"DK"/"dreh kipp"/"drehkipp"->"Dreh-Kipp"; "festverglast"/"fix"->"Fest".',
  anschlag: '"DIN links"/"DIN rechts" nur wenn eindeutig genannt, sonst "—".',
  material: 'Freier deutscher String, z.B. "Kunststoff","Kunststoff-Aluminium","Aluminium","Holz". "PVC"->"Kunststoff". "" wenn nicht genannt.',
  verglasung: '"zweifach"->"2fach", "dreifach"->"3fach".',
  farbe: 'Freier deutscher String, z.B. "Weiß","Anthrazit".',
  notiz: 'Wörtliche Restinfo oder Unklarheit, sonst "".',
});

function quoteList(values) {
  return values.map((value) => `"${value}"`).join(',');
}

function fieldPromptLine(field) {
  const description = FIELD_DESCRIPTIONS[field.key] || field.label;
  if (field.type === 'dimension') {
    return `- ${field.key} (ganze Zahl): ${description} Immer ganze Millimeter-Zahlen.`;
  }
  if (field.type === 'count') {
    return `- ${field.key} (ganze Zahl): ${description} Standard ${field.default}.`;
  }
  if (field.type === 'enum') {
    return `- ${field.key}: ${description} Genau einer von ${quoteList(field.options)}. Standard "${field.default}".`;
  }
  return `- ${field.key} (string): ${description} Standard "${field.default}".`;
}

function promptFieldList() {
  return AUFMASS_FIELDS.map(fieldPromptLine).join('\n');
}

function kimiApiKey(env = process.env) {
  return env.KIMI_API_KEY || env.MOONSHOT_API_KEY || '';
}

function stripReasoning(text = '') {
  return String(text || '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

function extractJson(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function hasNonLatinScript(text) {
  return NON_LATIN_RE.test(String(text || ''));
}

function providerConfigs(env = process.env) {
  // Kimi primär: erzwingt JSON (response_format) und lieferte stabil korrekte Listen.
  // Nemotron nur Fallback und nur mit Reasoning AN — "detailed thinking off" (05.07.) produzierte
  // Höhen=0, duplizierte Zeilen und erfundene Werte (Regression im Live-Test 07.07.).
  const providers = [];
  const kimiKey = kimiApiKey(env);
  if (kimiKey) {
    const model = env.FENSTERSHOP_LLM_MODEL || KIMI_DEFAULT_MODEL;
    providers.push({
      name: 'KIMI',
      url: KIMI_URL,
      key: kimiKey,
      model,
      timeoutMs: Number(env.FENSTERSHOP_LLM_TIMEOUT_MS) || 25000,
      body(prompt) {
        return {
          model,
          temperature: 0.2,
          max_tokens: 2500,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        };
      },
    });
  }

  const nemotronKey = env.NVIDIA_API_KEY || '';
  if (nemotronKey) {
    const model = env.FENSTERSHOP_NEMOTRON_MODEL || NEMOTRON_DEFAULT_MODEL;
    const nemotronThinking = (env.FENSTERSHOP_NEMOTRON_THINKING || 'on').toLowerCase() === 'on';
    providers.push({
      name: 'NEMOTRON',
      url: NEMOTRON_URL,
      key: nemotronKey,
      model,
      timeoutMs: Number(env.FENSTERSHOP_NEMOTRON_TIMEOUT_MS) || 30000,
      body(prompt) {
        return {
          model,
          temperature: 0.2,
          top_p: 0.95,
          max_tokens: nemotronThinking ? 4000 : 2500,
          stream: false,
          messages: [
            { role: 'system', content: nemotronThinking ? 'detailed thinking on' : 'detailed thinking off' },
            { role: 'user', content: prompt },
          ],
        };
      },
    });
  }
  return providers;
}

export async function extractWindows({ transcript, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const providers = providerConfigs(env);
  if (providers.length === 0 || typeof fetchImpl !== 'function') return null;

  const prompt = `Du bist Aufmaß-Assistent für einen deutschen Fensterhändler. Wandle das frei gesprochene/diktierte Handwerker-Transkript in eine strukturierte Fensterliste um. Gib AUSSCHLIESSLICH gültiges JSON zurück, exakt in der Form {"windows":[ ... ],"zusammenfassung":"..."} — kein Fließtext, keine Markdown-Codeblöcke.
WICHTIG: Antworte ausschließlich auf Deutsch. Alle Textwerte (raum, material, farbe, notiz) und die zusammenfassung MÜSSEN deutschsprachig sein (deutsches Alphabet inkl. ä ö ü ß). Niemals Chinesisch, Englisch oder eine andere Sprache/Schrift verwenden.

Pro Fenster diese Felder (alle Schlüssel immer ausgeben):
${promptFieldList()}

Zusätzlich immer ausgeben:
- zusammenfassung (string): Kurzer, zusammenhängender, natürlicher deutscher Absatz mit 2-5 Sätzen, der die verstandene Fensterliste in normaler Sprache wiedergibt, damit der Kunde sie schnell lesen und bestätigen kann, bevor daraus eine strukturierte Liste wird. Beispiel: "Sie haben 2 Fenster im Wohnzimmer mit 120 x 140 cm, Dreh-Kipp, weiß, Kunststoff, dreifach verglast, sowie ein festverglastes Fenster im Bad mit 60 x 40 cm genannt." Wenn nichts verstanden wurde, kurz auf Deutsch sagen, dass keine eindeutige Fensterliste erkannt wurde, statt Felder aufzulisten.

Regeln:
- Maße immer ganze Millimeter-Zahlen. Wenn Breite ODER Höhe nicht eindeutig erkennbar: Wert 0 setzen und Grund in notiz vermerken.
- Denkpausen, Füllwörter und Wiederholungen ignorieren.
- Nichts erfinden, das nicht im Transkript steht; fehlende Pflichtfelder mit den genannten Standardwerten füllen.

Transkript:
"""${String(transcript || '')}"""`;

  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const response = await fetchImpl(provider.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${provider.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(provider.body(prompt)),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw Object.assign(new Error(`${provider.name.toLowerCase()}_failed_${response.status}`), { status: response.status });
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const parsed = extractJson(stripReasoning(content));
      if (!Array.isArray(parsed?.windows)) throw new Error(`${provider.name.toLowerCase()}_invalid_windows`);
      const combinedText = [
        typeof parsed.zusammenfassung === 'string' ? parsed.zusammenfassung : '',
        ...parsed.windows.flatMap((window) => Object.values(window || {}).filter((value) => typeof value === 'string')),
      ].join(' ');
      if (hasNonLatinScript(combinedText)) throw new Error(`${provider.name.toLowerCase()}${NON_GERMAN_ERROR_SUFFIX}`);
      const summary = typeof parsed.zusammenfassung === 'string' ? parsed.zusammenfassung.trim().slice(0, 4000) : '';
      return { windows: parsed.windows, model: provider.model, summary, provider: provider.name };
    } catch (error) {
      if (Object.hasOwn(error || {}, 'status')) {
        console.error(`[aufmass] ${provider.name} failed`, error.status);
      } else if (error?.message === `${provider.name.toLowerCase()}${NON_GERMAN_ERROR_SUFFIX}`) {
        console.error(`[aufmass] ${provider.name} non-german output rejected`);
      } else {
        console.error(`[aufmass] ${provider.name} failed`, error);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
