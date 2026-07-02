// portable module: no imports from radar internals. In the DFS repo, move to lib/aufmass/.

const KIMI_URL = 'https://api.moonshot.ai/v1/chat/completions';

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

  const prompt = `Du bist Aufmaß-Assistent für einen deutschen Fensterhändler. Wandle das frei gesprochene/diktierte Handwerker-Transkript in eine strukturierte Fensterliste um. Gib AUSSCHLIESSLICH gültiges JSON zurück, exakt in der Form {"windows":[ ... ]} — kein Fließtext, keine Markdown-Codeblöcke.

Pro Fenster diese Felder:
- raum (string): Raum/Position. Kürzel/Dialekt ausschreiben ("Wohnzi"->"Wohnzimmer", "Schlafzi"->"Schlafzimmer", "Bad", "Küche"). "" wenn nicht genannt.
- breiteMm (ganze Zahl): Breite in Millimetern. "1,20 m" / "ein Meter zwanzig" / "120 cm" -> 1200.
- hoeheMm (ganze Zahl): Höhe in Millimetern, gleiche Umrechnung.
- anzahl (ganze Zahl): Stückzahl, Standard 1. "zwei mal"/"3 Stück" -> anzahl erhöhen, NICHT duplizieren.
- oeffnungsart: genau einer von "Dreh","Kipp","Dreh-Kipp","Fest". "DK"/"dreh kipp"/"drehkipp"->"Dreh-Kipp"; "festverglast"/"fix"->"Fest". Standard "Dreh-Kipp".
- material (string): z.B. "Kunststoff","Kunststoff-Aluminium","Aluminium","Holz". "PVC"->"Kunststoff". "" wenn nicht genannt.
- verglasung: "2fach" oder "3fach". "zweifach"->"2fach". Standard "3fach".
- farbe (string): z.B. "Weiß","Anthrazit". Standard "Weiß".
- notiz (string): wörtliche Restinfo oder Unklarheit, sonst "".

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
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    const parsed = extractJson(data.choices?.[0]?.message?.content || '{}');
    if (!Array.isArray(parsed?.windows)) return null;
    return { windows: parsed.windows, model };
  } catch (error) {
    console.error('[aufmass] extractWindows failed', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
