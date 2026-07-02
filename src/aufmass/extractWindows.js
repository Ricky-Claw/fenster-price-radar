// portable module: no imports from radar internals. In the DFS repo, move to lib/aufmass/.

import { AUFMASS_FIELDS } from './schema.js';

const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';

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

export async function extractWindows({ transcript, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const apiKey = kimiApiKey(env);
  const model = env.FENSTERSHOP_LLM_MODEL || 'moonshot-v1-8k';
  if (!apiKey || typeof fetchImpl !== 'function') return null;

  const prompt = `Du bist Aufmaß-Assistent für einen deutschen Fensterhändler. Wandle das frei gesprochene/diktierte Handwerker-Transkript in eine strukturierte Fensterliste um. Gib AUSSCHLIESSLICH gültiges JSON zurück, exakt in der Form {"windows":[ ... ],"zusammenfassung":"..."} — kein Fließtext, keine Markdown-Codeblöcke.

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(env.FENSTERSHOP_LLM_TIMEOUT_MS) || 25000);
  try {
    const response = await fetchImpl(KIMI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const parsed = extractJson(data.choices?.[0]?.message?.content || '{}');
    if (!Array.isArray(parsed?.windows)) return null;
    const summary = typeof parsed.zusammenfassung === 'string' ? parsed.zusammenfassung.trim().slice(0, 4000) : '';
    return { windows: parsed.windows, model, summary };
  } catch (error) {
    console.error('[aufmass] extractWindows failed', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
