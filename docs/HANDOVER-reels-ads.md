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

## Offen/Kontext
- Aktion „bis zu 70 € Gebühren-Erstattung" endet **15.08.** — K3-Reel hat also kurze Restlaufzeit, ggf. priorisieren oder gleich auf Evergreen (K1/K2) fokussieren.
- Neue Creatives in Anzeigen einbauen = schreibende Aktion → Go-Prozess wie oben.
