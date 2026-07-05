# Aufmaß per Sprache — Fenster-Sprachkonfigurator

Öffentliche Seite, auf der ein Handwerker/Kunde seine Fensterliste **einspricht**, die KI daraus eine **strukturierte, editierbare Liste** macht, der Nutzer sie **prüft/bestätigt** und als **PDF/JSON** speichert oder als **Anfrage absendet**.

**Live:** https://fenster-price-radar.vercel.app/aufmass.html — kein Login nötig.

---

## Für den Nutzer (Verkaufsleiter / Handwerker)

1. **🎤 Sprachaufnahme** tippen und Fensterliste einsprechen (oder Mikrofon-Taste der Handy-Tastatur). Android/Chrome am besten; iPhone stoppt evtl. nach Pause → einfach wieder tippen.
2. **In Fensterliste umwandeln** → KI zeigt zuerst einen kurzen **Fließtext zum Bestätigen**, dann die Tabelle.
3. **Prüfen & editieren.** Orange „prüfen"-Zeilen = KI unsicher. Hinweis: **alle** Werte gegenchecken, KI kann sich auch bei unmarkierten verschätzen.
4. **📄 Dokument-Kopf bearbeiten** (Titel, Firma, Fußzeile) → bestimmt, wie das PDF aussieht.
5. **Speichern (JSON) / Drucken / Als PDF speichern** oder **Absenden** (Anfrage).

Eingaben werden **lokal automatisch gespeichert** (überleben Neuladen/Netzausfall).

---

## Technik (kurz)

- **Frontend:** eine statische Seite `public/aufmass.html` (Vanilla JS, kein Framework).
- **KI-Extraktion:** Moonshot **Kimi** (`moonshot-v1-8k`) über `api/aufmass.js` → `src/aufmass/extractWindows.js`.
- **Feld-Schema (Single Source of Truth):** `src/aufmass/schema.js` treibt Normalizer (`normalizeWindows.js`), KI-Prompt und Tabelle. Format ändern = hier + inline `FIELDS` in der HTML (Drift-Guard-Test sichert Sync).
- **Absenden:** `api/aufmass-submit.js` — nimmt die Liste an, vergibt Referenz `AUF-…`, leitet an Webhook weiter (siehe Env).
- **Rate-Limiting:** In-Memory pro-IP + global (`src/aufmass/rateLimit.js`).
- **Persistenz:** Browser-`localStorage` (kein Backend/DB).

### Env-Variablen (Vercel)

| Variable | Zweck |
|---|---|
| `KIMI_API_KEY` **oder** `MOONSHOT_API_KEY` | KI-Zugang (gleicher Key wie der Chatbot) — **Pflicht**, sonst keine Umwandlung |
| `AUFMASS_TICKET_WEBHOOK` | Ziel-URL fürs Absenden (CMS/Ticket). Ungesetzt = „erfasst (Testphase)", kein echter Versand |
| `AUFMASS_ALLOW_ORIGIN` | CORS-Origin, falls die Seite mal fremd-domainig eingebettet wird (sonst same-origin) |
| `FENSTERSHOP_LLM_MODEL`, `FENSTERSHOP_LLM_TIMEOUT_MS` | KI-Modell/Timeout (optional) |
| `AUFMASS_RL_*`, `AUFMASS_SUBMIT_RL_*` | Rate-Limit-Feintuning (optional) |

### Test / Build

```bash
npm run test:aufmass    # Offline-Smoke (Normalizer, Extractor, Handler, Rate-Limit, Drift-Guard)
npm run build
```

---

## Offen / nicht in dieser Seite

- **Webdesigner:** Kontaktformular (Name/Mail/Tel), DSGVO-Einwilligung, Mail/Telegram-Anbindung, finales Branding/Logo.
- **ITler:** `AUFMASS_TICKET_WEBHOOK` = eure CMS-/Ticket-URL setzen → ab dann echter Versand (UI zeigt automatisch „gesendet").
- **Vor echtem Kundenstart:** Testphase-Banner oben entfernen (ein `<div class="test-banner">` in `public/aufmass.html`).

> Sicherheit: XSS-sicher (`textContent`), Body-Cap 64 KB, Security-Header (CSP/HSTS/X-Frame-Options), nicht-spoofbare Client-IP fürs Rate-Limit, kein Ziel-URL aus dem Request (kein SSRF). Rate-Limit ist In-Memory (best-effort pro Instanz) — für echten Ansturm später Vercel KV.
