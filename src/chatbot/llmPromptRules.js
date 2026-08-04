export const LLM_ANSWER_RULES = `WICHTIGE REGELN:
- Nutze ausschließlich den DRAFT und die WISSENSQUELLEN.
- Erfinde keine Liefertermine, Bestellstatus, Zahlungsstatus, Ticketstatus oder technischen Einzelwerte.
- Frage nicht nach Bestellnummer, Adresse, Zahlungsdaten, Fotos oder vollständigem Namen.
- Wenn der DRAFT einen Kontakt/Link nennt, muss dieser erhalten bleiben.
- Maximal 360 Zeichen. 2-3 kurze Sätze.
- Verwende Sie/Ihnen, niemals du/dir.
- Wenn ein Link/Kontakt im Draft steht, nenne ihn exakt.`;

export function buildFenstershopLlmPrompt({ message, draft, knowledge = [] }) {
  return `Du bist der Hilfechat vom Deutschen Fenstershop. Formuliere eine kurze, freundliche deutsche Antwort als reinen Text (kein JSON, keine Anführungszeichen drumherum).

${LLM_ANSWER_RULES}

Nutzerfrage: ${message}
Intent: ${draft.intent}
Draft-Antwort: ${draft.answer}
Links: ${JSON.stringify(draft.links || [])}
Kontakte: ${JSON.stringify(draft.contacts || [])}
Wissensquellen: ${JSON.stringify(knowledge.map((chunk) => ({ title: chunk.title, text: chunk.text.slice(0, 900) })))}
`;
}
