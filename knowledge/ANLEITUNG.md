# Bedienungsanleitung: Firmenwissen für Janela pflegen

Janela (der Website-Chatbot) beantwortet Kundenfragen aus drei Quellen, in dieser Reihenfolge: harte Regeln (Regelwerk), **dieser Wissensordner**, gecrawlte Website-Inhalte. Alles, was hier als Datei liegt, kann Janela in Antworten verwenden — mit Quellenangabe.

## So fügt ihr Wissen hinzu (ohne Programmierkenntnisse)

1. Im Browser öffnen: **github.com/Ricky-Claw/fenster-price-radar** → Ordner **`knowledge/`**
2. Oben rechts **„Add file" → „Create new file"** klicken (zum Bearbeiten einer bestehenden Datei: Datei anklicken → Stift-Symbol)
3. Dateiname vergeben, z. B. `garantie-und-gewaehrleistung.md` (Kleinbuchstaben, Bindestriche statt Leerzeichen, Endung `.md`)
4. Wissen als normalen Text schreiben (Format siehe unten)
5. Unten **„Commit changes"** klicken — kurze Beschreibung reicht (z. B. „Garantie-Infos ergänzt")
6. **1–2 Minuten warten** — die Seite wird automatisch neu veröffentlicht. Danach kennt Janela das Wissen.

Zum Testen: `fenster-price-radar.vercel.app/janela-chatbot-test.html` öffnen (Login nötig) und eine Frage zum neuen Wissen stellen.

## Format der Wissensdateien

Eine Datei pro Thema. Überschriften mit `#`/`##`, darunter normale Absätze:

```
# Garantie und Gewährleistung

## Gesetzliche Gewährleistung

Auf alle Fenster gilt die gesetzliche Gewährleistung von 2 Jahren ab Lieferung.
Reklamationen bitte immer über das Reklamationsformular einreichen.

## Herstellergarantie Drutex

Drutex gewährt auf Profile 5 Jahre Herstellergarantie. Die Garantie setzt
fachgerechten Einbau voraus.
```

Regeln dabei:

- **Ein Absatz = eine in sich verständliche Aussage** (mind. 1–2 vollständige Sätze). Janela findet Wissen absatzweise — ein Absatz, der nur „Ja." enthält, hilft niemandem.
- **Die Überschrift darüber beschreibt das Thema** — sie wird für die Suche stark gewichtet. „Herstellergarantie Drutex" ist gut, „Wichtig!" ist nutzlos.
- Schreibt so, wie die Antwort beim Kunden ankommen darf — Janela formuliert nur um, erfindet nichts dazu.

## Was hier NICHT reingehört

- **Keine Kundendaten, Bestellnummern, internen Preise oder Einkaufskonditionen** — der Ordner ist Antwortquelle für die öffentliche Website.
- **Keine Zusagen, die das Regelwerk verbietet** (verbindliche Liefertermine, Montage-Zusagen, Reklamationsentscheidungen). Die harten Regeln greifen zwar vorher, aber doppelter Boden schadet nicht.
- **Nichts Veraltetes stehen lassen** — falsches Wissen ist schlimmer als keins. Datei bearbeiten oder löschen (Datei öffnen → Mülleimer-Symbol → Commit).

## Wie es technisch funktioniert (Kurzfassung für Entwickler)

`src/chatbot/fenstershopChatbot.js` liest beim Start jede `.md`/`.txt` in `knowledge/` (außer dieser Anleitung), zerlegt sie an Leerzeilen in Absätze und nimmt sie mit `sourceType: 'firmenwissen'` ins Keyword-Retrieval auf — gleiche Suche und gleiche Guardrails wie das übrige Wissen, LLM-Polierung inklusive. Damit die Dateien in der Vercel-Serverless-Funktion verfügbar sind, bundelt `vercel.json` sie über `functions["api/chatbot.js"].includeFiles`. Test: `npm run test:chatbot` (enthält eine Assertion, dass dieser Ordner ins Retrieval einfließt).

## Grenzen (bewusst so gehalten)

- Änderungen brauchen einen Commit + ~1–2 Min Deploy — kein Live-Adminpanel. Dafür: versioniert, nachvollziehbar, jederzeit rückrollbar über die GitHub-Historie.
- Suche ist stichwortbasiert, keine semantische Vektor-Suche. Für die Größenordnung (Dutzende Dateien) völlig ausreichend; sollte der Ordner stark wachsen, ist der Umstieg auf Embeddings der nächste Schritt (Plan liegt in `FENSTERSHOP_CHATBOT_PLAN.md`).

## Harte Antwort-Regeln pflegen (`chatbot-regeln.json`)

Neben dem Wissen liegen auch die **harten Regeln** (Liefernotfall, Bestellstatus, Reklamation, Preise, Abholung …) hier im Ordner: **`knowledge/chatbot-regeln.json`**. Diese Antworten kommen wortgleich beim Kunden an — ohne KI-Umformulierung.

So bearbeitet ihr eine Regel (gleicher Weg wie beim Wissen: Datei in GitHub öffnen → Stift → Commit):

- **`antwort`** — der Text, den Janela ausgibt. Platzhalter wie `{{contacts.logisticsPhone}}` oder `{{links.delivery}}` werden automatisch durch die zentralen Telefonnummern/Links ersetzt (zentral gepflegt, eine Änderung wirkt überall).
- **`stichwoerter`** — Suchmuster, bei denen die Regel greift. Klein geschrieben, Umlaute ohne Punkte (`ae` oder `a`), ß als `ss`. `.*` heißt „beliebiger Text dazwischen".
- **`nicht`** — Muster, die die Regel verhindern (z. B. greift „Preis" nicht, wenn es um Versandkosten geht).
- **Reihenfolge zählt:** die erste passende Regel gewinnt.

Vorsicht: Die Datei ist JSON — ein fehlendes Komma macht alle Regeln unwirksam (der Bot läuft dann nur noch über Wissenssuche und Kontakt-Verweise, stürzt aber nicht ab). Im Zweifel vor dem Commit auf https://jsonlint.com prüfen. Test für Entwickler: `npm run test:chatbot`.
