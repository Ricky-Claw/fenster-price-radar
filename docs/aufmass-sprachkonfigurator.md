# Aufmaß per Sprache — Fenster-Sprachkonfigurator

Öffentliche Seite, auf der ein Handwerker/Kunde seine Fensterliste **einspricht**, die KI daraus eine **strukturierte, editierbare Liste** macht, der Nutzer sie **prüft/bestätigt** und als **PDF/JSON** speichert oder als **Anfrage absendet**.

**Live:** https://fenster-price-radar.vercel.app/aufmass.html — kein Login nötig.

---

## Für den Nutzer (Verkaufsleiter / Handwerker)

1. **🎤 Sprachaufnahme** tippen und Fensterliste einsprechen (oder Mikrofon-Taste der Handy-Tastatur). Android/Chrome am besten; iPhone stoppt evtl. nach Pause → einfach wieder tippen.
2. **In Fensterliste umwandeln** → KI zeigt zuerst einen kurzen **Fließtext zum Bestätigen**, dann die Tabelle.
   Die Zusammenfassung lässt sich mit **🔊 Vorlesen** anhören; die optionale Nachricht/Kontakt-Notiz kann über ihr eigenes Mikrofon diktiert werden.
3. **Prüfen & editieren.** Orange „prüfen"-Zeilen = KI unsicher. Hinweis: **alle** Werte gegenchecken, KI kann sich auch bei unmarkierten verschätzen.
4. **📄 Dokument-Kopf bearbeiten** (Titel, Firma, Fußzeile) → bestimmt, wie das PDF aussieht.
5. **Speichern (JSON) / Drucken / Als PDF speichern** oder **Absenden** (Anfrage).

Eingaben werden **lokal automatisch gespeichert** (überleben Neuladen/Netzausfall).

---

## Technik (kurz)

- **Frontend:** eine statische Seite `public/aufmass.html` (Vanilla JS, kein Framework).
- **KI-Extraktion:** Primär NVIDIA **Nemotron** (`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`) über NVIDIA API; automatischer Fallback auf Moonshot **Kimi** (`moonshot-v1-8k`) über `api/aufmass.js` → `src/aufmass/extractWindows.js`.
- **Feld-Schema (Single Source of Truth):** `src/aufmass/schema.js` treibt Normalizer (`normalizeWindows.js`), KI-Prompt und Tabelle. Format ändern = hier + inline `FIELDS` in der HTML (Drift-Guard-Test sichert Sync).
- **Felder:** Die Liste enthält unter anderem **Teilung** und **Marke/Profil**; bei fehlender Verglasungsangabe gilt **2fach** als Default.
- **Absenden:** `api/aufmass-submit.js` — nimmt die Liste an, vergibt Referenz `AUF-…`, leitet an Webhook weiter (siehe Env). Der Payload enthält zusätzlich `transcript` (Roh-Diktat, auf 6000 Zeichen gekappt). Die Ticket-/CMS-Seite muss `notiz` und `transcript` bei der Anzeige escapen, da beides Freitext vom Nutzer bzw. LLM enthält.
- **Rate-Limiting:** In-Memory pro-IP + global (`src/aufmass/rateLimit.js`).
- **Persistenz:** Browser-`localStorage` (kein Backend/DB).

### Env-Variablen (Vercel)

| Variable | Zweck |
|---|---|
| `NVIDIA_API_KEY` | KI-Zugang für NVIDIA Nemotron; aktiviert Nemotron als primäre KI. Ungesetzt = Kimi wie bisher |
| `FENSTERSHOP_NEMOTRON_MODEL`, `FENSTERSHOP_NEMOTRON_TIMEOUT_MS` | Nemotron-Modell/Timeout (optional) |
| `FENSTERSHOP_NEMOTRON_THINKING` | Nemotron-Reasoning an/aus (Default `off` = schneller/günstiger; `on` für mehr Genauigkeit) |
| `KIMI_API_KEY` **oder** `MOONSHOT_API_KEY` | Fallback-KI-Zugang für Moonshot Kimi. Wenn kein `NVIDIA_API_KEY` gesetzt ist, wird Kimi direkt genutzt |
| `AUFMASS_TICKET_WEBHOOK` | Ziel-URL fürs Absenden (CMS/Ticket). Ungesetzt = „erfasst (Testphase)", kein echter Versand |
| `AUFMASS_ALLOW_ORIGIN` | CORS-Origin, falls die Seite mal fremd-domainig eingebettet wird (sonst same-origin) |
| `FENSTERSHOP_LLM_MODEL`, `FENSTERSHOP_LLM_TIMEOUT_MS` | Kimi-Fallback-Modell/Timeout (optional) |
| `AUFMASS_RL_*`, `AUFMASS_SUBMIT_RL_*` | Rate-Limit-Feintuning (optional); Aufmaß-API pro IP standardmäßig 30/min (Büro/VPN-tauglich), global weiterhin 60/min als Kosten-Deckel |

### Test / Build

```bash
npm run test:aufmass    # Offline-Smoke (Normalizer, Extractor, Handler, Rate-Limit, Drift-Guard)
npm run build
```

## Vor jedem Kunden-Termin

`npm run check:live` — prüft die Live-Seite anonym von außen (Seite erreichbar, API antwortet, Absenden-Endpoint ok).

Optional: `CHECK_LIVE_KI=1 npm run check:live` für einen echten KI-Testcall (kostet einen LLM-Call).

---

## Offen / nicht in dieser Seite

- **Webdesigner:** Kontaktformular (Name/Mail/Tel), DSGVO-Einwilligung, Mail/Telegram-Anbindung, finales Branding/Logo. Das Rohtranskript wird mitgesendet und kann Namen, Nummern oder Umgebungsgespräche enthalten; deshalb einen Einwilligungs-Hinweis am Mikrofon einplanen.
- **ITler:** `AUFMASS_TICKET_WEBHOOK` = eure CMS-/Ticket-URL setzen → ab dann echter Versand (UI zeigt automatisch „gesendet").
- **Vor echtem Kundenstart:** Testphase-Banner oben entfernen (ein `<div class="test-banner">` in `public/aufmass.html`).

## DSGVO-Vermerk — Pflicht-Checkliste vor Anbindung ans Kunden-CMS

> Dieser Vermerk beschreibt, welche personenbezogenen Daten fließen und was vor dem Setzen von `AUFMASS_TICKET_WEBHOOK` (= echter Versand ins CMS/Ticketsystem) geklärt sein muss. Er ist eine technische Checkliste, keine Rechtsberatung.

**Welche Daten fließen beim Absenden an den Webhook:**
`reference`, `submittedAt`, `windowCount`, `windows[]` (12 Sachfelder inkl. Freitext `notiz`), `note` (freies Nachricht/Kontakt-Feld, max. 2000 Zeichen — Platzhalter fordert explizit Name/Rückrufnummer an) und `transcript` (Roh-Diktat, max. 6000 Zeichen). **Personenbezug ist damit der Normalfall**, nicht die Ausnahme: `note` enthält gewollt Kontaktdaten; `transcript` kann Namen, Telefonnummern, Adressen und ungewollt mitgeschnittene Umgebungsgespräche Dritter enthalten.

**Checkliste vor dem Go-Live der CMS-Anbindung:**
1. **Transparenz/Einwilligung (Webdesigner):** Hinweis an beiden Mikrofon-Buttons und vor dem Absenden, dass das Diktat als Text mitgesendet wird; Datenschutzerklärung der Seite um diese Verarbeitung ergänzen (Zweck: Angebotserstellung/Aufmaß).
2. **Browser-Spracherkennung benennen:** Die Diktatfunktion nutzt die Spracherkennung des Browsers (Web Speech API) — je nach Browser läuft die Audio-Verarbeitung über Server des Browser-Anbieters (z.B. Google bei Chrome). Gehört in die Datenschutzerklärung; die Seite selbst überträgt kein Audio, nur den erkannten Text.
3. **Auftragsverarbeitung (ITler):** Liegt das CMS/Ticketsystem bei einem externen Anbieter, AV-Vertrag prüfen/schließen. Webhook-Ziel nur `https://`.
4. **Speicherbegrenzung (ITler):** Löschfrist im CMS für `transcript` und `note` festlegen (Empfehlung: `transcript` nach Angebotserstellung löschen — es ist nur Nachvollzieh-Hilfe, die Sachdaten stehen strukturiert in `windows[]`).
5. **Anzeige-Sicherheit (ITler):** `notiz` und `transcript` beim Rendern im CMS escapen (Freitext vom Nutzer bzw. LLM, siehe Technik-Teil).
6. **Datenminimierung (bereits umgesetzt):** Entwürfe bleiben lokal im Browser (localStorage, kein Server); sensible Eingaben werden erst beim bewussten „Absenden" übertragen; das Transkript ist hart auf 6000 Zeichen gekappt; die KI-Extraktion erhält keine Kontaktfelder zurückgespielt.
7. **Betroffenenrechte (Kunde):** Auskunft/Löschung muss im CMS auch `transcript`/`note` erfassen — bei der Referenz `AUF-…` beginnt die Suche.

> Sicherheit: XSS-sicher (`textContent`), Body-Cap 64 KB, Security-Header (CSP/HSTS/X-Frame-Options), nicht-spoofbare Client-IP fürs Rate-Limit, kein Ziel-URL aus dem Request (kein SSRF). Rate-Limit ist In-Memory (best-effort pro Instanz) — für echten Ansturm später Vercel KV.
