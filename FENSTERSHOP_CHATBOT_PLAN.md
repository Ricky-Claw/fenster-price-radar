# Fenstershop Chatbot MVP Plan

Stand: 2026-05-11

## Ziel

Chatbot als Widget/Snippet für den Deutschen Fenstershop. Der Bot beantwortet allgemeine Fragen zu Lieferung, Logistik, Reklamation, Konfigurator, Montage, Aufmaß, Technikbegriffen, Förderthemen und Wissensinhalten der Website.

Wichtig: Der Bot hat im MVP keinen Zugriff auf Backend, Bestellungen, Tickets, Zahlungen, Kundendaten, Produktionsstatus oder konkrete Lieferavisierungen.

## Produktprinzip

**Rule-first RAG with LLM.**

1. Harte Regeln aus `programmierlogik_chatbot_final_mit_anfrage_status.md` haben Vorrang.
2. Danach RAG-Suche in freigegebenen Quellen.
3. LLM formuliert kurze Antworten nur aus gefundenem Kontext.
4. Wenn Quelle fehlt oder Unsicherheit hoch ist: nicht raten, sondern passenden Kontakt/Link nennen.
5. Jede Wissensantwort soll interne Links/Quellen anbieten können.

## Out of Scope MVP

- Keine Backend-/Shop-System-Anbindung.
- Keine Bestellstatusprüfung.
- Keine Zahlungsprüfung.
- Keine Ticketstatusprüfung.
- Keine verbindlichen Liefertermine.
- Keine verbindlichen technischen Zusagen zu konkreten Produkt-IDs/Konfigurationen.
- Keine aktive Abfrage sensibler Daten im Chat: Bestellnummer, Adresse, Zahlungsdaten, Fotos, vollständiger Name.
- Keine automatische Reklamationsanlage.

## Wissensquellen

### P0 Quellen

- `programmierlogik_chatbot_final_mit_anfrage_status.md` als Regel- und Eskalationsbasis.
- Website-Seiten:
  - `https://deutscher-fenstershop.de/wissenswertes`
  - `https://deutscher-fenstershop.de/erklaervideo`
  - `https://deutscher-fenstershop.de/fensterbegriffe`
  - `https://deutscher-fenstershop.de/profilschnitte-detailzeichnungen/pvc`
  - `https://deutscher-fenstershop.de/fenster#versand-und-lieferzeiten`
- PDFs:
  - AGB
  - Lieferbedingungen
  - technische PDFs / Montagehinweise, sofern freigegeben
- Admin-Uploads aus dem gepflegten „Informationen“-Ordner.

### Quellen-Regel

Nur veröffentlichte (`published`) Inhalte dürfen für Nutzerantworten genutzt werden.

## Antwortpriorität

1. **Liefernotfall / Fahrer vor Ort / Lieferung heute**
   - Immer Logistik-Telefon: `+49 7221 3022 157`

2. **Sichtbarer Transportschaden bei Anlieferung**
   - Fahrer informieren
   - Schaden auf Lieferschein vermerken lassen
   - Fotos machen
   - Reklamationsformular nennen: `https://deutscher-fenstershop.de/system/reklamation`

3. **Konkrete Bestellung / Liefertermin / Bestellstatus / Zahlung / Ticket / Anfrage-ID**
   - Keine Systemauskunft.
   - Passende E-Mail/Formular nennen.

4. **Konkrete technische Werte zu Produkt-ID/Konfiguration**
   - Keine verbindliche Aussage.
   - Technische Abteilung nennen: `+49 7221 3022 126`

5. **Allgemeine Technik-/Konfigurator-/Montage-/Wissensfrage**
   - RAG-Suche.
   - LLM formuliert Antwort mit Quellenlinks.

6. **Keine belastbare Quelle**
   - Transparent sagen, dass keine sichere Info vorliegt.
   - Kontaktweg/Link anbieten.

## Kontaktlogik

- Logistik / avisierte Lieferung / Liefernotfall: `+49 7221 3022 157`
- Technische Beratung / Konfiguratorprobleme: `+49 7221 3022 126`
- Logistik allgemein: `logistik@deutscher-fenstershop.de`
- Technik: `technik@deutscher-fenstershop.de`
- Bestellstatus / Änderungswünsche / konkrete Storno-Anfragen: `bestellstatus@deutscher-fenstershop.de`
- Zahlung / Zahlungseingang / Zahlungsstatus: `zahlung@deutscher-fenstershop.de`
- Bearbeitungsstand konkreter Anfragen / Anfrage-ID: `anfrage@deutscher-fenstershop.de`
- Reklamation: `https://deutscher-fenstershop.de/system/reklamation`
- Callback/Anfrage: `https://deutscher-fenstershop.de/callback`

## Architektur

### 1. Widget / Snippet

Einbindung im Shop per JavaScript:

```html
<script
  src="https://chat.deutscher-fenstershop.de/widget.js"
  data-tenant="dfs"
  data-api-url="https://dfs-chat-api.onrender.com"
></script>
```

Aufgaben:
- Chat UI anzeigen.
- Session-ID erzeugen.
- Nachrichten an Bot API senden.
- Antwort, Quellenlinks und Kontaktbuttons anzeigen.
- Datenschutz-Hinweis anzeigen.
- Mobile + Desktop sauber darstellen.

### 2. Bot API auf Render

Endpunkte:
- `POST /chat`
- `GET /health`
- `GET /widget-config`
- `POST /feedback`
- Admin:
  - `POST /admin/upload`
  - `POST /admin/publish`
  - `GET /admin/documents`
  - `DELETE /admin/documents/:id`

Aufgaben:
- Intent-Erkennung.
- PII-/Datenschutz-Check.
- Rule Engine.
- RAG Retrieval.
- LLM-Antwortgenerierung.
- Quellenlinks anhängen.
- Rate Limits / Abuse Protection.

### 3. Worker / Ingestion Pipeline auf Render

Aufgaben:
- Website crawlen.
- PDFs herunterladen/verarbeiten.
- Admin-Uploads verarbeiten.
- Text extrahieren.
- Chunks erzeugen.
- Embeddings berechnen.
- Supabase aktualisieren.
- Versionierung + Publish-Status verwalten.

### 4. Supabase

Nutzung:
- Auth für Adminportal.
- Storage für Originaldateien.
- Postgres für Dokumente/Chunks/Regeln.
- pgvector für RAG-Suche.

### 5. Git

Versioniert:
- harte Regeln
- Prompts
- Kontaktlogik
- Deployment-Konfig
- Crawler-Konfig

## Supabase Datenmodell MVP

### `documents`

- `id uuid primary key`
- `title text`
- `source_type text` — website, pdf, upload, git_rule
- `source_url text`
- `storage_path text`
- `category text`
- `status text` — draft, published, archived
- `version int`
- `checksum text`
- `created_at timestamptz`
- `updated_at timestamptz`
- `published_at timestamptz`
- `created_by uuid`

### `document_chunks`

- `id uuid primary key`
- `document_id uuid references documents(id)`
- `chunk_index int`
- `content text`
- `content_hash text`
- `metadata jsonb`
- `embedding vector(1536)`
- `status text` — draft, published, archived
- `created_at timestamptz`

### `bot_rules`

- `id uuid primary key`
- `rule_key text`
- `intent text`
- `priority int`
- `condition jsonb`
- `response_template text`
- `allowed_actions jsonb`
- `forbidden_claims jsonb`
- `contact_target text`
- `status text`
- `version int`

### `feedback`

- `id uuid primary key`
- `session_id uuid`
- `rating int`
- `comment text`
- `created_at timestamptz`

### Chat Logs

MVP Empfehlung: keine vollständigen Chatlogs speichern. Nur anonymisierte Fehler-/Feedbackdaten, sofern freigegeben.

## Adminportal MVP

Funktionen:
- Login via Supabase Auth.
- Upload von `.md`, `.txt`, `.pdf`; später `.docx` und `.zip`.
- Dokumentliste mit Titel, Kategorie, Status, Version, Datum.
- Dokumentstatus: Draft / Published / Archived.
- Extraktionsvorschau.
- Button: `Veröffentlichen`.
- Re-Index auslösen.
- Rollback auf letzte Version.
- Testchat: Frage stellen, Antwort + Quellen + Guardrail-Ergebnis sehen.

UX-Regel: Admin pflegt keine Datenbank. Admin lädt Dateien hoch, prüft Vorschau, klickt Veröffentlichen.

## RAG Pipeline

1. Quelle anlegen oder Upload speichern.
2. Worker extrahiert Text.
3. Text normalisieren.
4. Chunks erzeugen.
5. Embeddings erzeugen.
6. Draft-Chunks speichern.
7. Admin prüft Vorschau.
8. Publish setzt neue Version aktiv.
9. Alte Version wird archiviert.

## Chat-Antwortfluss

1. User-Nachricht empfangen.
2. Sensible Daten erkennen und nicht weiter aktiv abfragen.
3. Intent klassifizieren.
4. Rule Engine prüfen.
5. Wenn harte Regel greift: Template-Antwort + Kontakt/Link.
6. Sonst RAG-Suche in published Chunks.
7. Nur bei ausreichend starken Treffern LLM aufrufen.
8. LLM bekommt nur Frage + gefundene Quellen + Systemregeln.
9. Antwort kurz, deutsch, mit internen Links.
10. Wenn keine Quelle: Eskalation/Kontakt.

## LLM-Nutzung

LLM ist eingebunden, aber kontrolliert:
- nur nach RAG-Treffer oder für Formulierung einer regelbasierten Antwort
- kein freies Wissen
- kurze Antworten
- Kostenlimit pro Tag/Monat
- Caching häufiger Antworten
- Fallback ohne LLM möglich

Geeignete Modelle:
- günstiges Mini-Modell für Antwortformulierung
- Embedding-Modell für RAG

## Kostenrahmen MVP

### Günstiger Start

- Supabase Free: 0 €
- Render Starter/Free: 0–7 $
- LLM/Embeddings limitiert: ca. 5–30 €

Erwartung: ca. **10–50 €/Monat**, solange Supabase Free reicht und LLM limitiert ist.

### Stabiler Produktivbetrieb

- Supabase Pro: ca. 25 $
- Render API + Worker: ca. 15–50 $
- LLM/Embeddings: ca. 20–80 €

Erwartung: ca. **60–150 €/Monat**.

## Acceptance Criteria MVP

### Widget

- Snippet lässt sich auf Testseite einbinden.
- Desktop und Mobile funktionieren.
- Datenschutz-Hinweis sichtbar.
- Antwort zeigt Kontaktbuttons/Links, wenn relevant.

### Regeln

- Liefernotfall triggert Logistik-Telefon.
- Bestellstatus triggert `bestellstatus@deutscher-fenstershop.de`.
- Zahlung triggert `zahlung@deutscher-fenstershop.de`.
- Anfrage-ID triggert `anfrage@deutscher-fenstershop.de`.
- konkrete technische Produktfrage triggert Technik-Telefon.
- Bot fragt keine sensiblen Daten aktiv ab.

### RAG

- Website-Inhalte werden indexiert.
- PDFs werden indexiert.
- Admin-Uploads werden indexiert.
- Antwort nutzt nur published Inhalte.
- Antwort enthält 1–3 passende interne Links, wenn vorhanden.
- Bei schwachen Treffern wird nicht halluziniert.

### Admin

- Admin kann Dokument hochladen.
- Admin kann Dokument veröffentlichen/deaktivieren.
- Veröffentlichtes Wissen wird im Chat genutzt.
- Rollback ist möglich.

### Betrieb

- API hat Healthcheck.
- Worker kann manuell und geplant laufen.
- Fehler/unbeantwortete Fragen werden anonymisiert erfasst.
- Kostenlimit für LLM vorhanden.

## Risiken

- Website/PDF-Inhalte sind veraltet oder widersprüchlich.
- Nutzer geben trotzdem personenbezogene Daten ein.
- LLM formuliert zu verbindlich.
- Admin lädt falsche oder sensible Dokumente hoch.
- Supabase Free reicht bei vielen PDFs nicht.
- Crawler muss Shop-Seiten sauber extrahieren.

## Offene Fragen

1. Gibt es schon Supabase-Projekt oder neu anlegen?
2. Wo liegt der „Informationen“-Ordner aktuell?
3. Soll Chatverlauf gespeichert werden? Empfehlung MVP: nein, nur anonymisierte Fehlfragen.
4. Soll Quellenanzeige öffentlich immer sichtbar sein oder nur optional ausklappbar?
5. Welche Seiten/PDFs sind P0 für ersten Crawl?
6. Wer darf Admin sein?
7. Welches Monatslimit für LLM? Vorschlag Start: 25–50 €.

## Milestones

### M1 — Konzept + Datenbasis

- Plan finalisieren.
- Kontaktlogik validieren.
- Supabase Schema anlegen.
- erste Website/PDF Quellenliste definieren.

### M2 — Ingestion MVP

- Website/PDF/Text Upload verarbeiten.
- Chunking + Embeddings.
- Publish Status.

### M3 — Bot API MVP

- Intent/Rule Engine.
- RAG Retrieval.
- LLM Antwort mit Quellen.
- Guardrails.

### M4 — Widget MVP

- Snippet.
- Chat UI.
- Quellen/Kontaktbuttons.
- Datenschutz-Hinweis.

### M5 — Admin MVP

- Login.
- Upload.
- Dokumentliste.
- Publish.
- Testchat.

### M6 — QA / Abnahme

- Testfälle aus `.md` abdecken.
- Datenschutz-Checks.
- Kostenlimit prüfen.
- Pilot im Shop einbauen.

## Erste konkrete Tasks

1. `programmierlogik_chatbot_final_mit_anfrage_status.md` in strukturierte Rule-Intents zerlegen.
2. Supabase Schema vorbereiten.
3. Crawler für definierte Fenstershop-Seiten bauen.
4. PDF/Text Extractor bauen.
5. RAG Retrieval gegen Supabase pgvector bauen.
6. Bot API `/chat` mit Rule-first Flow bauen.
7. Widget Testseite bauen.
8. Admin Upload + Publish MVP bauen.
9. Testfälle für alle kritischen Regeln erstellen.
10. Deployment auf Render vorbereiten.
