---
titel: "DFS Meta-Kampagnen: Betriebsstand 12.08.2026 + Diagnose CPM statt Creatives"
datum: 2026-08-12
agent: fable
bereich: projekte
status: aktiv
tags: [meta, ads, dfs, kampagnen, cpm]
quelle: "Repo ~/fenster-price-radar · docs/HANDOVER-meta-ads.md"
---

## Stand (12.08.2026)

Werbekonto `act_1036360495706797`:

| Kampagne | ID | Status | Budget |
| --- | --- | --- | --- |
| K1_Kalt | `52505942191196` | aktiv | 10,00 €/Tag |
| K2_Warm | `52506089700996` | pausiert | 3,30 €/Tag |
| K3_RT_Aktion | `52506089700796` | pausiert (Endedatum 15.08.) | 6,60 €/Tag |
| K4_B2B_Handwerker | `52511522097396` | aktiv, **Lernphase bis ~26.08.** | 3,30 €/Tag |

14-Tage-Werte: K1 149,27 € / 7 Leads / CPL 21,32 € · K3 68,66 € / 2 / 34,33 € · K2 33,12 € / 0 Leads · K4 9,01 € / 1 / 9,01 €.

K4 ist die neue B2B-Schiene (Fensterbau- und Montagebetriebe, nicht Endkunden): eigenes Instant Form `1537074027699146` mit Sortierfrage Betriebsart, V3-Papierkram-Reel als Video-Ad.

## Diagnose 11.08. — der wichtigste Befund

**Die Creatives sind nicht das Problem.** CTR 2,0–2,8 % liegt über dem üblichen Lead-Ads-Schnitt (1–1,5 %), und 11–15 % der Klicks werden zu Leads — die Formularstrecke ist seit dem SMS-Fix gesund.

Der Kostentreiber ist der **CPM von 42–50 €** gegenüber marktüblichen 10–15 €. Ursachen: das Leads-Ziel bietet auf teure High-Intent-Nutzer, enge Interessen-Zielgruppen plus Ausschlüsse verkleinern die Auktion, und Tagesbudgets von 3–10 € reichen nicht, damit Meta die Lernphase sauber abschließt.

Daraus abgeleitete Hebel (jeweils Elvis-Go nötig, max. eine Änderung pro Kampagne und Woche):
1. K1-Zielgruppe auf volles Advantage+ öffnen (Interessen-Eingrenzung raus) — größte Auktion, niedrigster CPM. **Go steht noch aus.**
2. Fertige Reels als Video-Ads einbauen (liegen in `tools/banner-maker/out/reels/`) — Video-Placements haben strukturell günstigere CPMs.
3. Budget konzentriert halten statt streuen.

## Historische Lehre: Instant-Form-Reibung

Die Ursprungsformulare liefen mit Typ „Höhere Absicht" plus **SMS-Verifizierung** — das drückte die Abschlussrate auf 5,5 % (26 Formular-Öffnungen, 1 Lead, 82 € Spend; normal sind 20–40 %). Seit der Umstellung auf „Höheres Volumen", optionaler Telefonnummer und weniger Pflichtfeldern ist die Strecke gesund. **Regel: nie mit „Höhere Absicht" + SMS starten, wenn Lead-Volumen das Ziel ist.**

## Offene Punkte

1. K3-Entscheid nach Aktionsende (reaktivieren mit neuer Aktion oder Budget umverteilen).
2. K4 ab 26.08. auswerten — insbesondere der Anteil Leads mit Antwort „Privatkunde" misst die Targeting-Qualität.
3. Hinter dem B2B-Formular liegt noch das B2C-Standardangebot; Händler-/Partnerkonditionen mit Elvis klären.
4. K1-Reels V1/V2 fertig, aber in keiner Anzeige.

Betreuung läuft ab 12.08. in einer eigenen Session, Briefing: `docs/HANDOVER-meta-ads.md`. Verwandt: [[meta-api-anbindung]], [[dfs-meta-lead-pipeline]], [[dfs-meta-ads-foerderheld]].
