# Handover: Meta-Ads DFS — laufender Betrieb

**Für:** neue Session, die **ausschließlich** die Meta-Werbekampagnen des Deutschen Fenstershops betreut (Steuerung, Auswertung, Optimierung, neue Kampagnen). Stand: **12.08.2026**. Repo: `~/fenster-price-radar` (Welt A).

## Zuerst lesen
1. Skill **`dfs-meta-ads`** (`.claude/skills/dfs-meta-ads/SKILL.md`) — Kernregeln, Steuerregeln, Report-Format. **Pflicht.**
2. `docs/kampagne-meta-foerderheld.md` — Kampagnen-Dossier (Copy, Formulare, Messplan, Historie).
3. `docs/kampagne-foerderheld-bafa.md` — Compliance-Fakten der Aktion.
4. Nur bei Video-Themen zusätzlich: `docs/HANDOVER-reels-ads.md` (Reel-Produktion + Bewegtbild-Styleguide).

## Harte Regeln
- **Nie selbst schalten/ändern.** Kein Erstellen, Pausieren, Budget-Ändern ohne ausdrückliches Elvis-Go — pro Änderung einzeln, eine Freigabe gilt nicht für die nächste.
- **Keine erfundenen Zahlen.** Nur echte API-Daten (`npm run meta:radar`, `META_DATE_PRESET=last_14d` etc.). Fehlt eine Zahl, steht das so da.
- **Erste 14 Tage einer Kampagne nichts anfassen** (Meta-Lernphase).
- **Compliance:** „bis zu 15 %", kein Wort „BAFA" im Werbemittel, „erst Antrag, dann bestellen", keine unbestätigten Superlative.
- **Kundendaten (Leads) nie in Chat/Repo/Artifacts** — nur aggregierte Kennzahlen.
- Max. **ein Creative-/Struktur-Wechsel pro Kampagne und Woche**.

## Aktueller Stand (12.08.2026)
Werbekonto `act_1036360495706797`, Seite `1192875973914275`.

| Kampagne | ID | Status | Budget | Anmerkung |
|---|---|---|---|---|
| K1_Kalt | 52505942191196 | AKTIV | 10,00 €/Tag | Hauptkampagne, statische Feed-Bilder |
| K2_Warm | 52506089700996 | PAUSIERT | 3,30 €/Tag | 0 Leads bei 33 € — bewusst aus |
| K3_RT_Aktion | 52506089700796 | PAUSIERT | 6,60 €/Tag | Endedatum 15.08. erreicht |
| K4_B2B_Handwerker | 52511522097396 | AKTIV | 3,30 €/Tag | **NEU, Lernphase bis ~26.08. — nicht anfassen** |

**Performance 14 Tage:** K1 149,27 € / 7 Leads / CPL 21,32 € · K3 68,66 € / 2 / 34,33 € · K2 33,12 € / 0 · K4 9,01 € / 1 / 9,01 €.

**Diagnose vom 11.08. (wichtig):** Die Creatives sind **nicht** das Problem — CTR 2,0–2,8 % liegt über Branchenschnitt, und 11–15 % der Klicks werden Leads. Der Kostentreiber ist der **CPM von 42–50 €** (üblich 10–15 €). Ursachen: Leads-Ziel bietet auf teure High-Intent-Nutzer, enge Zielgruppe + Ausschlüsse verkleinern die Auktion, kleine Tagesbudgets verhindern sauberes Lernen.

## Offene Punkte
1. **K1 auf volles Advantage+ öffnen** (Interessen-Eingrenzung raus) — vorgeschlagener CPM-Hebel, Elvis-Go steht noch aus.
2. **K3-Entscheid:** Aktion ist am 15.08. ausgelaufen, Kampagne pausiert. Reaktivieren (neue Aktion?) oder Budget umverteilen?
3. **K4 nach dem 26.08. auswerten** — insbesondere: wie viele Leads antworten „Privatkunde" statt Betrieb? Das misst die Targeting-Qualität.
4. **B2B-Angebot fehlt inhaltlich:** Das K4-Formular läuft, aber dahinter liegt noch das B2C-Standardangebot. Händler-/Partnerkonditionen mit Elvis klären.
5. **Fertige Reels ungenutzt:** K1-Reels V1/V2 liegen in `tools/banner-maker/out/reels/`, noch in keiner Anzeige. Video-Placements haben günstigere CPMs — Einbau wäre der zweite CPM-Hebel.

## Werkzeuge
- **Zahlen:** `npm run meta:radar` (Env `META_DATE_PRESET`: `yesterday`, `last_7d`, `last_14d`). Token liegen in `.env` (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`) — nie in den Chat.
- **Täglicher Report:** Cloud-Routine „DFS Meta-Ads Tages-Check", 08:00 Berlin, meldet Spend/Impressionen/Leads je Kampagne. Nur lesend.
- **Schreibende Aktionen:** Graph API v21.0 mit `META_ACCESS_TOKEN` (Scopes inkl. `ads_management`, `leads_retrieval`) oder Ads Manager im Browser. Immer erst Go einholen.

## Was NICHT zu dieser Session gehört
Lead-Pipeline (Poller/CRM/Mail) läuft automatisch und ist fertig — nicht anfassen. Reel-Produktion hat eine eigene Session. Rückhol-Automatik, Chatbot, Preisradar: andere Baustellen.
