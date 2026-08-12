---
workflow: general-video
flow: automation
storyboard: no
message: "Der Staat gibt bis zu 15 % Zuschuss auf neue Fenster — Antrag in 5 Minuten, erst Antrag, dann bestellen."
destination: "Meta Ads (Reels/Stories-Placement, Förderheld-Kampagne K1 Kalt)"
aspect: "9:16 (1080x1920)"
language: de
audience: "Hausbesitzer 30–65+, Renovierung/Sanierung, kalte Zielgruppe"
length: "~15s (12–20s erlaubt)"
angle: "K1 Nutzen/Geld — Hook mit Zahl"
---

## Intent

Erstes Testreel der Förderheld-Reels-Serie (Muster vor Serie, Elvis-Abnahme am
gerenderten Video). Muss nativ nach Reel aussehen: Bewegung ab Sekunde 1,
Untertitel-Look, vertikal gedacht — kein animierter Banner.

Hook (0–2s): „20.000 € Fensterprojekt?" → „Bis zu 3.000 € Zuschuss zurück."
Story: Zahl-Hook → Nutzen (bis zu 15 %) → Mechanik kurz (Antrag 5 Min, ohne
Papierkram) → Pflichtsatz „Erst Antrag, dann bestellen." → CTA-Karte
(„Jetzt Förderhöhe in 2 Min checken", Button-Optik wie Banner).

## Assets

- Fotorealistische Blaupausen-Motive (Stil-Anker, dürfen nicht neu erfunden werden):
  `tools/banner-maker/out/foerderheld-instagram/story-bp-hook.jpg` (1080x1920),
  `story-bp-ablauf.jpg` (1080x1920), `karussell-bp-1..4.jpg` (1080x1080),
  `tools/banner-maker/out/foerderheld-meta/dfs-meta-feed-papierkram-1080.jpg`.
- Logo NUR als Overlay-Composite: `tools/banner-maker/out/_logo-weiss.png`,
  Einblendung ab ~Sekunde 2, dezent, nie über Text. Nie generieren.

## Customizations

- Look: Nachtblau `#0C2D57`, oranges Fensterglühen `#F47B20`, fotorealistisch-
  atmosphärisch, kein Flat-/Clipart-Look. Orange nur CTA/Störer/Zahlen.
- Typo: sehr fette serifenlose Grotesk, max. 2 Zeilen gleichzeitig.
- Untertitel Pflicht: weiß auf dunkler Halbtransparenz, Safe-Zones oben ~250px /
  unten ~300px frei.
- Sound: v1 ohne Voiceover; Musik wird bei Meta hinterlegt → Reel funktioniert stumm.
- Szenenwechsel alle 2–3s, CTA-Karte letzte 2–3s.

## Notes (Compliance, hart — je Frame prüfen)

- Zuschuss immer „bis zu 15 %", Beispiel exakt: 20.000 € → bis zu 3.000 €.
- Kein Wort „BAFA", keine Superlative, kein Partner-Logo, kein „Link in Bio".
- „Erst Antrag, dann bestellen" muss einmal lesbar stehen.
- Keine 70-€-Aktions-Claims (Aktion endet 15.08., K3-Thema).
- Output: gerendertes MP4 nach `tools/banner-maker/out/reels/`, nie `public/`.
