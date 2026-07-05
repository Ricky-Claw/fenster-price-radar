# Janela — Rebrand + Seiten-Bewusstsein

Stand: 2026-07-05

## Ausgangslage

Der Fenstershop-Chatbot (rule-first RAG, `src/chatbot/fenstershopChatbot.js` + `api/chatbot.js` + `public/chatbot-widget.js`) deckt bereits Logistik, Technik, Konfigurator, Bestellstatus, Zahlung und Reklamation inkl. ASP-Kontakten ab (`programmierlogik_chatbot_final_mit_anfrage_status.md`, Teil 2). Anselm (DFS) kennt diesen Stand noch nicht und erwartet eine erste Testversion. Diese Runde liefert zwei Deltas: Markenname "Janela" und ein seiten-bewusstes Begrüßungs-/Vorschlagssystem, damit der Bot spürbar weiß, auf welcher Shop-Seite der Besucher gerade ist.

## Ziel

1. Bot tritt überall als "Janela" auf (Widget-Titel, Begrüßung, Healthcheck-Service-Name).
2. Widget erkennt die aktuelle Shop-Seite und passt Begrüßungstext + Vorschlags-Chips an — die Backend-Antwortlogik (Intent-Erkennung, Regelwerk) bleibt unverändert.
3. Eine Testseite im Repo zeigt alle Seiten-Kontexte nebeneinander, damit Anselm/Elvis das Verhalten ohne echtes Embedding auf der Live-Seite prüfen können.

## Out of Scope

- Keine Änderung an der Intent-Erkennung/Antwortlogik in `fenstershopChatbot.js`.
- Kein echtes Embedding auf `deutscher-fenstershop.de` (folgt erst nach Freigabe durch Anselm).
- Keine Umbenennung von Dateien/Funktionsnamen/Endpoint (`/api/chatbot` bleibt).
- Kein Server-seitiges Tracking der Seite (kein Logging, keine DB — passt zum MVP-Prinzip "keine vollständigen Chatlogs").

## 1. Branding

- `public/chatbot-widget.js`: `data-title`-Default `'Fenstershop Hilfe'` → `'Janela'`. Begrüßungstext im Chat-Log erwähnt den Namen ("Hallo, ich bin Janela …").
- `api/chatbot.js`: GET-Healthcheck-Antwort `{ service: 'fenstershop-chatbot', ... }` → `{ service: 'janela', ... }`.

## 2. Seiten-Kontext

### Mechanik

- Widget ermittelt die aktuelle Seite über `currentScript.dataset.page` (Override, primär fürs Testen/Embedding auf Nicht-Standard-URLs) oder sonst `window.location.pathname`.
- Eine reine Client-Funktion `contextForPath(path)` mappt Pfad-Muster auf einen Kontext-Schlüssel. Kein Netzwerk-Call nötig, keine Backend-Änderung.
- Pro Kontext: eigener Begrüßungstext + eigene Chip-Liste (ersetzt die bisher fixen 5 Chips als Default).

### Kontext-Tabelle

| Kontext-Key | Pfad-Muster (Teilstring, lowercase) | Begrüßung (Kurzfassung) | Chips |
|---|---|---|---|
| `konfigurator` | `konfigurator` | Sieht, dass Besucher im Konfigurator ist; bietet Hilfe zu Konfiguration/Technik | „Hilfe beim Konfigurator“, „Uw-Wert erklären“, „Technische Frage stellen“ |
| `versand` | `versand`, `lieferzeit` | Nennt sich für Lieferfragen zuständig | „Lieferzeit erfahren“, „Lieferung heute?“, „Lieferadresse ändern“ |
| `reklamation` | `reklamation` | Weist auf Reklamationsformular hin | „Reklamation melden“, „Transportschaden melden“ |
| `kontakt` | `kontakt`, `anfrage`, `callback` | Hilft beim richtigen Anfrageweg | „Anfrage senden“, „Montage-Frage“ |
| `wissen` | `wissenswertes`, `fensterbegriffe`, `erklaervideo`, `profilschnitte` | Bietet Erklärungen zu Fachbegriffen an | „Fachbegriff erklären“, „Technische Frage stellen“ |
| `standard` | (kein Treffer, inkl. Startseite) | Generische Begrüßung wie bisher | „Lieferzeit?“, „Bestellstatus“, „Transportschaden“, „Konfigurator Hilfe“, „Uw-Wert erklären“ |

Reihenfolge der Prüfung: erstes Pattern-Match gewinnt (Liste von oben nach unten), Fallback `standard`.

### Datenfluss

- Kein `page`-Feld geht ans Backend — Backend-Vertrag (`POST /api/chatbot`) bleibt exakt wie heute (`message`, `sessionId`).

## 3. Testseite

- Neue Datei `public/janela-chatbot-test.html`, Aufbau analog `public/rueckhol-popups-test.html` (Kachel-Grid, kein Framework, ein `<script>` pro Kachel/iFrame).
- Eine Kachel pro Kontext aus der Tabelle oben (6 Kacheln), jede bindet das Widget mit `data-page="<Beispielpfad>"` ein, sodass sich alle Varianten in einer URL nebeneinander vergleichen lassen.
- Hinweistext oben: "Testseite — nicht für Kunden verlinken", analog bestehendem Muster.
- `vercel.json`: `janela-chatbot-test.html` zur Rewrite-Ausnahme-Regex hinzufügen (wie `rueckhol-popups-test.html`).

## Testing

- `npm run test:chatbot` muss weiterhin grün sein (bestehende Guardrail-/Smoke-Tests unverändert, da Backend-Logik nicht angefasst wird).
- Manuell: Testseite in der Preview öffnen, für jede Kachel Chat öffnen → richtige Begrüßung/Chips prüfen, eine Frage stellen → Antwort kommt wie gewohnt vom bestehenden Regelwerk.

## Risiken

- Pfad-Matching ist simpel (Teilstring), keine Kollisionen bei den aktuell bekannten DFS-URLs erkennbar (geprüft gegen `LINKS`-Konstanten in `fenstershopChatbot.js`).
