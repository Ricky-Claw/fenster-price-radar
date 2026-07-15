# Kampagne: Deutscher Fenstershop x Förderheld — BAFA-Förderung (20.07.–14.09.2026)

## Kernbotschaft & Mechanik

Wer neue Fenster plant, geht mit Förderheld diese vier Schritte: 1. Daten in 5 Minuten auf förderheld.com eingeben — Förderheld übernimmt den gesamten Förderprozess inklusive Antragstellung. 2. Förderzusage abwarten, dann Fenster bei Deutscher Fenstershop bestellen. 3. Fenster einbauen lassen. 4. Rechnung und Zahlungsnachweis bei Förderheld hochladen — die Förderung wird ausgezahlt. Kein Papierkram, keine Kommunikation mit dem BAFA nötig — Förderheld begleitet bis zur Auszahlung. Compliance-Kern: Der BAFA-Antrag muss vor Vertragsabschluss/Bestellung gestellt sein (Vorhabenbeginn) — ein bloßes Kontakt-/Lead-Formular ist NICHT der Antrag; kommuniziert wird immer „Antrag eingereicht, dann bestellen", empfohlen „Zusage abwarten, dann bestellen".

## BAFA-Faktenblatt

Stand Juli 2026, vor Livegang gegen bafa.de prüfen.

- BEG-Einzelmaßnahme Fenstertausch: 15 % Zuschuss, +5 % iSFP-Bonus = bis zu 20 %.
- Förderfähige Kosten: max. 30.000 €/Wohneinheit/Jahr, mit iSFP 60.000 €.
- Beispielrechnung: 20.000-€-Fensterprojekt → bis zu 4.000 € Zuschuss (mit iSFP).
- Technisch: U-Wert ≤ 0,95 W/(m²K); bei Tausch von mehr als einem Drittel der Fenster Lüftungskonzept nach DIN 1946-6.
- Energieeffizienz-Experte (EEE) ist Pflicht — Förderheld sind zertifizierte Gebäudeenergieberater und decken das ab.
- Antragstellung zwingend VOR Vorhabenbeginn.

Quellen: bafa.de (Förderprogramm im Überblick; Einzelmaßnahmen Gebäudehülle), Recherche 15.07.2026.

## Wording: Do / Don't

Verbindlich für alle Kanäle.

### DO

- „bis zu 20 %"-Sprache
- konkrete belegte Zahlen (5 Minuten Antrag, 24 Stunden Einreichung, Auszahlung typisch 8–12 Wochen nach Einreichung (Angabe Förderheld))
- „Bezahlung bei Förderheld erst nach positiver Förderzusage"
- Reihenfolge immer aktiv erklären

### DON'T

- „Förderung sicher/garantiert"
- „Geld garantiert"
- feste Förderhöhen ohne „bis zu"
- „Deutschlands schnellste BAFA-Zusage" als Tatsachenbehauptung (Zusage-Dauer liegt beim BAFA — nur Antrags-/Einreichungs-Tempo ist belegt)
- keine Angst-/Heizkosten-Panik
- keine FIFA-/fremden Marken
- kein Geldregen-/Clipart-Look

### Disclaimer-Baustein

Unter Ads-Landing + Newsletter-Fußzeile:

> Alle Angaben zu Förderprogrammen ohne Gewähr. Höhe und Bewilligung der Förderung sind abhängig vom individuellen Vorhaben und der Entscheidung des BAFA. Der Förderantrag muss vor Vertragsabschluss gestellt werden.

## Kampagnen-Claim

Empfehlung: „Fenster fördern lassen — in 5 Minuten beantragt." (43 Z.)

Alternativen:

- „Bis zu 20 % Zuschuss. Antrag in 5 Minuten."
- „Neue Fenster. Förderantrag in 5 Minuten erledigt."

Erster Split-Test: Empfehlung vs. Zuschuss-Variante.

## Google Ads RSA

Zeichenlimits geprüft.

### Headlines (≤30 Z.)

1. Fenster: bis zu 20% Förderung
2. Förderantrag in 5 Minuten
3. BAFA-Zuschuss für Fenster
4. Erst Antrag, dann bestellen
5. Bis zu 4.000€ Zuschuss
6. Förderheld prüft kostenlos
7. Zahlung erst nach Zusage
8. Fenster vom Fenstershop
9. In 24h beim BAFA

### Descriptions (≤90 Z.)

1. Bis zu 20% BAFA-Zuschuss für neue Fenster. Erst Antrag in 5 Minuten, dann bestellen.
2. Förderheld reicht Ihren Antrag in 24h beim BAFA ein. Zahlung erst nach Zusage.
3. Erst Förderantrag stellen, dann Fenster bestellen. Wir erklären die Reihenfolge.
4. Zertifizierte Energieberater von Förderheld begleiten Ihren Antrag von Anfang an.

Anmerkung: Eine zehnte Headline („Jetzt Förderung sichern lassen") wurde im Review als grenzwertig zu „Förderung sicher" gestrichen.

## Display-Banner

Generator: `npm run banner:make -- --aktion foerderheld-energieberater`

Copy kommt aus dem Aktionskalender (claim/offer/badge dort gepflegt — Single Source).

- Set A Zuschuss-Fokus: Badge „Bis zu 20 %", CTA „Jetzt beantragen".
- Set B Tempo-Fokus (Adhoc-Config): Claim „Förderantrag in 5 Minuten erledigt", Offer „5 Minuten Antrag, 24 Stunden Einreichung — nach der Zusage direkt bestellen.", Badge „In 5 Min beantragt", CTA „Antrag starten".
- Motive: `tools/banner-maker/motive/foerderheld-energieberater/` (KI-Motive, gitignored).
- Größen: `sizes.json` (Seed Google-Standard; finale Liste von Elvis ausstehend).

## Newsletter

Brevo, Versand nur mit Elvis-GO.

### Betreff-Varianten

- „Neue Fenster mit bis zu 20 % Förderung"
- „Ihr Förderantrag ist in 5 Minuten fertig"
- „So läuft Ihre BAFA-Förderung für Fenster"

### Preheader

„Antrag stellen, Zusage abwarten, dann bei uns bestellen — wir erklären die Reihenfolge."

### Body (~190 Wörter)

Planen Sie einen Fenstertausch? Dann lohnt sich ein Blick auf die aktuelle BAFA-Förderung, bevor Sie bestellen.

Über unseren Partner Förderheld — zertifizierte Energieeffizienz-Experten — geben Sie Ihre Daten in nur 5 Minuten online ein, ganz ohne Papierkram und ohne Behörden-Schriftverkehr. Förderheld übernimmt den gesamten Förderprozess inklusive Antragstellung und reicht den Antrag binnen 24 Stunden beim BAFA ein. Bezahlt wird erst, wenn die Förderzusage tatsächlich vorliegt.

Wichtig ist die Reihenfolge: Der Antrag muss vor Vertragsabschluss gestellt werden. Deshalb funktioniert die Zusammenarbeit so:

1. Sie geben Ihre Daten über Förderheld ein — 5 Minuten, digital. Förderheld übernimmt die Antragstellung.
2. Sie warten die Förderzusage ab und bestellen dann Ihre neuen Fenster bei Deutscher Fenstershop.
3. Sie lassen die Fenster einbauen.
4. Sie laden Rechnung und Zahlungsnachweis bei Förderheld hoch — die Förderung wird kurz darauf ausgezahlt.

So begleitet Förderheld den Prozess bis zur Auszahlung, ohne Papierkram und ohne Behörden-Schriftverkehr.

Zur Einordnung: Bei einem Fensterprojekt von 20.000 € sind mit individuellem Sanierungsfahrplan bis zu 20 % Zuschuss möglich — das entspricht bis zu 4.000 €.

Förderfähig sind Fenster mit U-Wert ≤ 0,95 W/(m²K), wie sie bei uns Standard sind.

CTA: „Förderantrag jetzt in 5 Minuten stellen"

## Social

FB/IG, 3 Posts.

### Post 1: edukativ, „5 Fakten BAFA"

Fenstertausch planen? 5 Fakten zur BAFA-Förderung, die Sie kennen sollten: Bis zu 20 % Zuschuss möglich (mit individuellem Sanierungsfahrplan). Förderfähig sind Kosten bis 30.000 €, mit Sanierungsfahrplan bis 60.000 €. Neue Fenster brauchen einen U-Wert von 0,95 W/(m²K) oder besser. Ein Energieeffizienz-Experte muss eingebunden sein. Und: Der Antrag muss vor der Bestellung raus. Mit Förderheld dauert das 5 Minuten.

Bild: ruhige Infografik, 5 nummerierte Fakten auf DFS-Dunkelblau, Orange-Akzent nur bei „5 Minuten".

### Post 2: Mechanik, „4 Schritte"

So kombinieren Sie Förderung und neue Fenster richtig: Erst geben Sie Ihre Daten über Förderheld ein — 5 Minuten, digital; Förderheld übernimmt die Antragstellung. Dann die Förderzusage abwarten und bei Deutscher Fenstershop bestellen. Anschließend die Fenster einbauen lassen. Nach Abschluss der Arbeiten laden Sie Rechnung und Zahlungsnachweis bei Förderheld hoch — die Förderung wird kurz darauf ausgezahlt. Diese Reihenfolge ist wichtig, denn der Antrag muss vor Vertragsabschluss gestellt sein. Kein Papierkram, keine Kommunikation mit dem BAFA nötig.

Bild: vier Icons (Daten eingeben → Zusage → Bestellung & Einbau → Auszahlung) mit Pfeilen, DFS-Farbwelt.

### Post 3: Partner-Vorstellung

Neuer Partner an unserer Seite: Förderheld. Die zertifizierten Energieeffizienz-Experten übernehmen für Sie die komplette BAFA-Antragsstellung bei Ihrem Fenstertausch — digital, in 5 Minuten, ohne Papierkram. Sie reichen den Antrag binnen 24 Stunden beim BAFA ein und bezahlt wird erst, wenn die Zusage vorliegt. So bleibt die Förderung ein einfacher Schritt statt eines Hindernisses auf dem Weg zu neuen Fenstern.

Bild: ruhiges Split-Bild DFS-Fensterdetail | Förderheld-Logo, verbunden durch schlichte Orange-Linie.

## FAQ-Modul

Landingpage.

### Was wird bei einem Fenstertausch gefördert?

Der Austausch von Fenstern gegen Modelle mit U-Wert ≤ 0,95 W/(m²K) im Rahmen der BAFA-Einzelmaßnahme; Voraussetzung ist die Einbindung eines Energieeffizienz-Experten.

### Wie hoch ist die Förderung?

15 % der förderfähigen Kosten, mit individuellem Sanierungsfahrplan bis zu 20 %. Förderfähig: bis 30.000 €/Wohneinheit/Jahr, mit Sanierungsfahrplan bis 60.000 €.

### Erst Antrag oder erst bestellen?

Zuerst der Antrag — er muss vor Vertragsabschluss gestellt sein. Also: Antrag über Förderheld stellen, Zusage abwarten, dann bei Deutscher Fenstershop bestellen.

### Was übernimmt Förderheld?

Zertifizierte Gebäudeenergieberater; kompletter Online-Antrag in rund 5 Minuten, Einreichung beim BAFA binnen 24 Stunden und Begleitung des gesamten Förderprozesses bis zur Auszahlung — kein Papierkram, keine Kommunikation mit dem BAFA nötig.

### Was kostet Förderheld?

Bezahlt wird erst nach positiver Förderzusage — kein Risiko bei Ablehnung. Konkrete Konditionen direkt im Antragsprozess bei Förderheld.

### Wie erhalte ich die Förderung ausgezahlt?

Nach Abschluss der Arbeiten laden Sie Rechnung und Zahlungsnachweis bei Förderheld hoch; die Auszahlung folgt kurz darauf, typischerweise 8–12 Wochen nach Einreichung (Angabe Förderheld).

## Kanäle & Zeitplan

Start 20.07.2026 (nach WM-Finale), Ende 14.09.2026.

Kanäle: Website-Hero/Landing (FAQ-Modul), Google Display (Banner-Generator) + Search/RSA, Newsletter (Brevo, Elvis-GO), Social FB/IG (3 Posts + Carousel-Option), Retargeting.

UTM-Konvention: `utm_source={google|newsletter|facebook|instagram}`, `utm_medium={display|cpc|email|social}`, `utm_campaign=foerderheld-bafa-2026`.

## Asset-Inventar & offene Punkte

### Vorhanden

- Förderheld-Logo (`src/foerderheld-logo.png`, weißer Untergrund eingebacken)
- KI-Motiv Beratungsszene (`motive/foerderheld-energieberater/`, lokal)
- Kalender-Eintrag mit Claim/Offer/Badge
- Banner-Generator einsatzbereit

### Offen (Elvis)

- finale Banner-Größenliste (`sizes.json`)
- Designvorlagen-Bilder von Elvis
- Co-Branding-Freigabe durch Förderheld (Logo-Nutzung in Ads!)
- finale BAFA-Sätze vor Livegang gegen bafa.de verifizieren
- Newsletter-Versand-GO
- Landingpage-Umsetzung auf deutscher-fenstershop.de
