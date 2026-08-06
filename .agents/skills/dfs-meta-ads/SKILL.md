---
name: dfs-meta-ads
description: Use when planning, launching, analysing or optimising Meta (Facebook/Instagram) ad campaigns for a Deutscher Fenstershop action — "Meta-Kampagne für Aktion X", "wie laufen die Ads?", "Ads optimieren", "CPL zu hoch", weekly Ads-Review. Covers campaign architecture, ad copy within Meta limits, Instant Forms, and the weekly steering loop. NOT for creating the images (that is skill dfs-kampagnen-design).
---

# DFS Meta-Ads — Kampagnen bauen und steuern

Kanonisches Beispiel: `docs/kampagne-meta-foerderheld.md` (Förderheld 07/2026). Bei einer neuen Aktion diese Datei als Vorlage kopieren, nicht neu erfinden.

## Kernregeln (nicht verhandelbar)

1. **Ich schalte nie selbst.** Kein Erstellen, Starten, Pausieren oder Budget-Ändern ohne ausdrückliches Elvis-Go pro Aktion. Werbung gibt echtes Geld aus — jede schreibende Aktion ist einzeln zu bestätigen, auch wenn `ads_management` verfügbar ist. Eine Freigabe gilt für genau diese eine Änderung, nicht für die nächste.
2. **Keine erfundenen Zahlen.** Performance-Aussagen nur aus echten Daten (API-Snapshot oder von Elvis geliefertem CSV-Export). Fehlt eine Zahl, steht das so da. Branchen-Erfahrungswerte immer als solche kennzeichnen, nie als Prognose verkaufen.
3. **Compliance-Leitplanken der Aktion sind hart** und stehen im Kampagnen-Dossier unter `docs/kampagne-<aktion>.md`. Vor jeder Copy-Zeile prüfen. Für Förderheld: „bis zu 15 %", kein Wort „BAFA", erst Antrag dann bestellen, keine unbestätigten Superlative.
4. **Erste 14 Tage nichts anfassen.** Meta-Lernphase. Wer früher optimiert, optimiert Rauschen.
5. **Kundendaten bleiben drin.** Leads aus Instant Forms nie in den Chat kopieren, nicht ins Repo, nicht in Artifacts. Nur aggregierte Kennzahlen.

## Teil 1 — Kampagne bauen

### Architektur
Standard-Split bei kleinem Budget (≈500 €/Monat): drei Kampagnen entlang des Funnels, je **eine** Anzeigengruppe (mehr zersplittert das Budget), je 3 Textvarianten × 2–3 Creatives.

| | K1 Kalt | K2 Warm | K3 Retargeting |
|---|---|---|---|
| Angle | Nutzen/Geld | Mechanik/Vertrauen | Urgency/Aktion |
| Budget-Anteil | 60 % | 20 % | 20 % |
| Audience | Advantage+ mit Interessen-Signalen | Seiten-/IG-Interaktionen 365 T, Form geöffnet nicht gesendet 90 T | Form geöffnet nicht gesendet 30 T, ggf. Website-Besucher 30 T |

Immer: Ziel **Leads**, Advantage+-Platzierungen, Ausschluss vorhandener Leads der letzten 180 Tage.

**Ehrlichkeits-Regel:** Warm-Audience unter 1.000 Personen → Kampagne nicht starten, Budget zu Kalt. Keine Kampagne auf leerer Zielgruppe.

### Ad-Copy — Meta-Zeichenlimits (vor Abgabe zählen!)
- Primärtext: sichtbar bis ~125 Zeichen, danach „Mehr ansehen". Also **Hook ≤125 Zeichen**, Langfassung folgt nach Absatz.
- Headline **≤40**, Beschreibung **≤30**.
- Je Kampagne 3 Primärtexte mit unterschiedlichem Angle (nicht dreimal dasselbe umformuliert), 3 Headlines, 2 Beschreibungen.
- Jede Langfassung enthält die vollständige Mechanik der Aktion — der Hook darf verkürzen, die Langfassung nie verzerren.

### Instant Form statt Landingpage
Bei Lead-Zielen mit kleinem Budget schlägt das Instant Form die eigene Landingpage (kein Ladeverlust, vorausgefüllte Felder). Aufbau:
- Typ **„Höheres Volumen"**. Die Variante „Höhere Absicht" hängt eine Prüfseite an und schaltet die **SMS-Verifizierung** frei (Lead muss einen Einmal-Passcode eingeben) — das hat bei DFS 07/2026 die Abschlussrate auf **5,5 %** gedrückt (26 Form-Öffnungen, 1 Lead, 82 € Spend). Normal sind 20–40 %. „Höhere Absicht" nur wählen, wenn Lead-Qualität nachweislich das Problem ist, nie zum Start.
- **Qualitätsfilter vor dem Start prüfen:** SMS-Verifizierung aus, Telefonnummer auf **optional** (Meta empfiehlt das selbst), E-Mail als Pflichtfeld. Jedes Pflichtfeld kostet Abschlüsse.
- **Veröffentlichte Formulare sind nicht mehr editierbar.** Änderung = Duplikat anlegen, dort anpassen, in der Anzeige austauschen, neu veröffentlichen. Also lieber vor dem Start einmal richtig prüfen.
- **Multi-Advertiser Ads deaktivieren** — sonst schneidet Meta das Creative zu und zeigt es neben Fremdanzeigen.
- **Vor dem Start klären, wer die Leads abruft:** Leads landen im Leads Center der **Facebook-Seite**, nicht im Werbekonto. Wer nur Werbekonto-Zugriff hat (z. B. ein Agentur-Portfolio), sieht sie nicht — und ohne Seiten-Rolle kann auch kein Systemnutzer-Token sie lesen.
- Eine **Qualifizierungs-Frage** einbauen, die den Lead sortiert (bei DFS: „Fensterliste/Sanierungsplan vorhanden?"). Die Antwortverteilung ist später die wichtigste Qualitäts-Kennzahl.
- Kontaktfelder vorausgefüllt (Name, E-Mail, Telefon) + PLZ.
- Datenschutz-Link: **verifizierte URL** benutzen (bei DFS `/datenschutzerklaerung`, nicht `/datenschutz`) + Zusatzhinweis mit Förder-Vorbehalt.
- Danke-Screen mit konkretem nächsten Schritt + Button auf die Aktionsseite mit UTM.
- Instant Forms können **keine Datei-Uploads** — Fensterlisten laufen per Mail nach.

### Namenskonvention
Kampagnen `DFS_<AKTION>_K1_Kalt` / `_K2_Warm` / `_K3_RT`; Anzeigen `<K>_<Creative>_<PT>` (z. B. `K1_Feed-Fensterliste_PT1`). Ohne saubere Namen ist die Auswertung später wertlos.

### Creatives
Aus dem Fundus der Aktion wählen (`tools/banner-maker/out/<aktion>-meta/`), fehlende Formate über Skill **`dfs-kampagnen-design`** generieren. Nötige Formate: 1080×1080 (Feed), 1080×1920 (Stories/Reels), 1200×628 (Link-Platzierungen).
Vor Freigabe je Datei prüfen: trägt sie einen noch nicht freigegebenen Claim? Steht „Link in Bio" drauf (bei Paid falsch)? Ist ein Partner-Logo drin ohne Co-Branding-Freigabe? Solche Assets kommen auf eine **Sperrliste** im Dossier, nicht in die Kampagne.

## Teil 2 — Wöchentliche Optimierung

### Datenquelle
- **Stufe 1 (ohne Setup):** Elvis exportiert im Ads Manager den Bericht als CSV und wirft ihn hier rein. Funktioniert ab Tag 1.
- **Stufe 2 (API):** Systemnutzer-Token mit `ads_read` als Env `META_ACCESS_TOKEN` + Werbekonto-ID `META_AD_ACCOUNT_ID`. Kein App-Review nötig, solange es das eigene Werbekonto im eigenen Business-Portfolio ist. Fetcher nach dem Muster des Preisradars: Snapshot schreiben, bei API-Fehler alten Snapshot stehen lassen und Fehlerzeile in den Report — nie stillschweigend leere Daten ausliefern.

### Kennzahlen (jeden Montag, je Anzeige)
Spend · Impressionen · CTR · Form-Öffnungen · Leads · **CPL** · Anteil qualifizierter Leads (Antwort auf die Qualifizierungs-Frage).

CPL ist die Leitkennzahl, nicht CTR. Eine Anzeige mit guter CTR und ohne Leads ist eine schlechte Anzeige.

### Steuerregeln
- Tag 1–14: **nichts ändern**.
- Danach Anzeige pausieren, wenn CPL > 2× Kampagnenschnitt bei ≥20 € Spend, **oder** ≥15 € Spend ohne einzige Form-Öffnung.
- Maximal **ein Creative-Wechsel pro Kampagne und Woche** — sonst weiß niemand, was gewirkt hat.
- Warm-Audience unter 1.000 → pausieren, Budget zu Kalt.
- Befristete Aktions-Anzeigen mit **Endedatum anlegen**, nicht manuell dran denken.
- Budget verschieben immer in Schritten, nie verdoppeln — jede Änderung wirft die Anzeigengruppe teilweise in die Lernphase zurück.

### Erfolgsdefinition
Monat 1: stabiler CPL-Trend + Anteil qualifizierter Leads über der im Dossier gesetzten Schwelle. Monat 2: CPL −20 % durch Creative-Iteration (beste Variante skalieren, schwächste ersetzen).

### Report-Format an Elvis
Kurz, max. 15 Zeilen: (1) Zahlen der Woche als Tabelle je Kampagne, (2) was auffällt — auch wenn es „nichts Belastbares" ist, (3) konkreter Änderungsvorschlag mit exakten Klickpfaden im Ads Manager, (4) explizite Go-Frage. Nie Vorschlag und Ausführung in einem Zug.

## Rote Flaggen
| Ausrede | Realität |
|---|---|
| „Nach 3 Tagen sieht man schon, dass Anzeige B besser läuft" | Nein — Lernphase. Bei 500 €/Monat sind das ~15 Leads Gesamtstichprobe. |
| „Ich pausier das schnell, spart ja Geld" | Nein — schreibende Aktion, Elvis-Go pro Änderung. |
| „CTR ist super, läuft" | CPL zählt. CTR ohne Leads ist teure Aufmerksamkeit. |
| „Zielgruppe ist klein, aber Meta findet schon jemanden" | Unter 1.000 verbrennt das Budget. Pausieren. |
| „Ich nehm den Branchenschnitt als Prognose" | Erfahrungswert ≠ Zusage. Als solchen kennzeichnen. |
| „Alle Creatives rein, Meta sortiert das" | Erst Sperrliste prüfen: unbestätigte Claims, „Link in Bio", fremde Logos. |
