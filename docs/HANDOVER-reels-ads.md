# Handover: Reels & Shortform-Video-Ads für DFS

**Für:** neue Session, die Video-Creatives (Reels/Stories/Shorts, 9:16) als Meta-Werbeanzeigen für den Deutschen Fenstershop baut. Stand: 06.08.2026.

## Ausgangslage
- Laufende Meta-Kampagne **Förderheld 2026**: K1_Kalt / K2_Warm / K3_RT_Aktion, ~500 €/Monat, Ziel Leads via Instant Forms. Dossier (Pflichtlektüre): `docs/kampagne-meta-foerderheld.md` · Regeln: Skill **`dfs-meta-ads`** (`.claude/skills/dfs-meta-ads/SKILL.md`).
- Bisherige Creatives sind **statische Bilder** (Blaupausen-Look, Nachtblau `#0C2D57` + Orange `#F47B20`; Stil-Anker `tools/banner-maker/out/foerderheld-meta/`, Design-Spec-Muster `tools/banner-maker/specs/foerderheld-4x5.json`). Reels-/Stories-Placements laufen aktuell mit zugeschnittenen Feed-Motiven — dafür fehlen echte Bewegtbild-Creatives. **Das ist der Auftrag.**
- Lead-Pipeline dahinter ist fertig und läuft automatisch (VPS-Poller → CRM + Mail) — nicht anfassen, nicht Thema dieser Session.

## Harte Regeln (nicht verhandelbar)
1. **Nie selbst schalten/ändern an Live-Ads** — jede schreibende Ads-Aktion nur mit Elvis-Go, einzeln.
2. **Compliance Förderheld:** „bis zu 15 %", kein Wort „BAFA", Reihenfolge „erst Antrag, dann bestellen", keine unbestätigten Superlative, kein Partner-Logo, kein „Link in Bio".
3. **Erst billiges Muster zeigen, dann Serie** — nie erst die Vollversion produzieren (Elvis-Arbeitsweise).
4. KI-Bilder **nie über Higgsfield**, immer über Elvis' Codex (internes Bild-Tool, `~/.codex/generated_images`). Für Video: HyperFrames-Skills (`hyperframes` als Einstieg) rendern Video aus HTML — geeignet für Motion-Graphics-Reels aus den bestehenden Motiven.
5. Kundendaten/Leads nie in Chat/Repo/Artifacts.

## Formate & Einstieg
- Reels/Stories: **1080×1920 (9:16)**, Hook in den ersten 1–2 s, Safe-Zones oben/unten beachten (Meta-UI überlagert), Ton optional aber Untertitel Pflicht.
- Sinnvoller erster Schritt: 1 Motion-Graphics-Testreel (15 s) aus vorhandenen Förderheld-Motiven + Claim, Elvis zeigen, dann Serie je Kampagnen-Angle (K1 Nutzen/Geld, K2 Vertrauen/Mechanik, K3 Urgency 15.08.).
- Ads-Zugang (lesend) existiert: `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID` in `.env`, Konto `act_1036360495706797`, Performance-Check `npm run meta:radar`.

## Styleguide Bewegtbild (v1 — abgeleitet aus dem statischen Design-System, Feinschliff mit Elvis)
Basis bleibt der Skill **`dfs-kampagnen-design`** (Design-System, Logo- und Compliance-Regeln gelten 1:1). Zusätzlich für Video:
- **Look:** Blaupausen-Welt weiterführen — Nachtblau `#0C2D57`, oranges Fensterglühen `#F47B20`, fotorealistisch-atmosphärisch. Kein Flat-/Clipart-Look (Elvis lehnt das explizit ab).
- **Logo:** wie bei Statik NIE KI-generieren — als sauberes Overlay (`tools/banner-maker/out/_logo-weiss.png`), feste Position, erst ab Sekunde ~2 einblenden, dezent, nie über Text.
- **Typo:** kräftige serifenlose Grotesk, sehr fett für Headlines (wie Banner); Text-Einblendungen kurz und groß, max. 2 Zeilen gleichzeitig, Orange nur für CTA/Störer/Zahlen — nie Fließtext.
- **Tempo:** Hook in 1–2 s (Zahl oder Frage: „Bis zu 3.000 € zurück?"), Szenenwechsel alle 2–3 s, Gesamtlänge 12–20 s, CTA-Karte als letzte 2–3 s (Button-Optik wie Banner-CTA).
- **Untertitel:** Pflicht (Ton meist aus), weiß mit dunkler Halbtransparenz-Fläche, innerhalb der Safe-Zones (oben ~250 px, unten ~300 px frei).
- **Sound:** lizenzfrei/Meta-Bibliothek, ruhig-modern, kein Voiceover in v1 (spart Abstimmung); wenn später Voiceover: HyperFrames-TTS-Pipeline vorhanden.
- **Compliance im Video verschärft:** Claims stehen kurz im Bild → jede Zahl exakt wie im Dossier („bis zu 15 %", „bis zu 70 €", Beispiel 20.000 € → bis zu 3.000 €), Reihenfolge-Satz „Erst Antrag, dann bestellen" muss in jedem Reel einmal lesbar stehen.
- **Muster-Prozess:** 1 Testreel → Elvis-Go → Serie (3 Angles). Jede Abnahme am gerenderten Video, nie nur am Storyboard.

## Offen/Kontext
- Aktion „bis zu 70 € Gebühren-Erstattung" endet **15.08.** — K3-Reel hat also kurze Restlaufzeit, ggf. priorisieren oder gleich auf Evergreen (K1/K2) fokussieren.
- Neue Creatives in Anzeigen einbauen = schreibende Aktion → Go-Prozess wie oben.
