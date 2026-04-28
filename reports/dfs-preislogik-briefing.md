# Briefing für die Geschäftsführung: DFS-Preislogik im Fensterkonfigurator

Stand: 28.04.2026  
Quelle: Live-Konfigurator/API-Auswertung aus Fensterradar v1, DFS-Konfigurator-JS, aktuelle Anbieter-Abfragen.

## 1. Kurzfazit

Die DFS-Preislogik ist grundsätzlich nachvollziehbar und modular aufgebaut: Profil + Größe + Öffnungsart liefern einen Basispreis; Verglasung und weitere Optionen werden als Zuschläge berechnet; anschließend werden interne Kalkulationsfaktoren, MwSt. und Aktionsrabatte angewendet.

Kritisch ist aber: Die Logik ist technisch verteilt und für Management/Vertrieb schwer erklärbar. Es gibt keine einfache sichtbare Preisformel pro Profil. Rabattlogik, Basispreis-Matrix, Glaszuschläge und Aufschlagsfaktor liegen an unterschiedlichen Stellen. Dadurch entstehen Risiken bei Preispflege, Angebotskommunikation und Wettbewerbsanalyse.

## 2. Wie DFS Preise aktuell berechnet

Vereinfacht läuft die Berechnung so:

1. **Profil wählen**  
   Beispiel: Drutex Iglo 5 Classic, Aluplast Ideal 4000, Kömmerling 88 MD.

2. **Fenstertyp/Öffnungsart wählen**  
   Im Radar aktuell: einflügelig, Dreh-Kipp. Technisch wird dafür ein `openType` verwendet.

3. **Größe prüfen**  
   DFS liefert je Profil/Öffnungsart eine Preis-Matrix. Nur Größen, die in dieser Matrix sauber vorkommen, sind wirklich exakt vergleichbar. Wenn eine Größe gerundet wird, ist sie kein sauberer Vergleich.

4. **Basispreis aus Matrix holen**  
   Aus `POST /konfigurator/fenster` kommt pro Profil/Öffnungsart/Größe ein Basispreis.

5. **Verglasung berechnen**  
   Pro Profil gibt es Glasdaten wie `data_window_glass_<profileId>.json`. 2-fach/3-fach Verglasung wird über Glasgruppen ermittelt. Der Glaszuschlag kann je nach Datensatz anders berechnet werden:
   - fester Betrag
   - Prozent auf aktuellen Preis
   - pro m²
   - pro laufendem Meter
   - nach Breite/Höhe

6. **Interner Kalkulationsfaktor**  
   Im DFS-Konfigurator ist `window.myPricePercent = 90` sichtbar. Praktisch bedeutet das: Nach Basispreis + Glaszuschlag wird ein kalkulatorischer Aufschlag von 90% angewendet.

7. **MwSt.**  
   Danach wird mit 19% brutto gerechnet.

8. **Aktionsrabatt / Kunden-Endpreis**  
   Danach werden Rabatte als Kundenpreis berücksichtigt. Aktuell sichtbar:
   - Drutex PVC: 15% bis 31.05.2026
   - Aluplast: 5% bis 31.05.2026
   - Gealan: 20%
   - Salamander: 25%
   - Veka: 20%
   - Kömmerling: 35%

## 3. Korrelation: Profil, Größe und Verglasung

### Profil

Das Profil bestimmt die Preisbasis und technische Grenzen. Jedes Profil hat:
- eigene Preis-Matrix
- eigene verfügbare Minimal-/Maximalgrößen
- eigene Glasdaten
- eigene Rabattlogik über Marke/Material

Beispiel: Drutex Iglo 5 Classic hat andere Grenzgrößen als Aluplast Ideal 4000 oder Gealan S9000. Deshalb darf man nicht pauschal dieselben Maße über alle Profile legen, wenn man exakt vergleichen will.

### Größe

Größe wirkt mehrfach:
- direkt über die Preis-Matrix
- indirekt über Glasfläche
- bei manchen Zuschlägen über m², Laufmeter, Breite oder Höhe

Das bedeutet: Zwei Profile können bei kleinen Größen nah beieinander liegen, bei großen Größen aber stark auseinanderlaufen. Ein einzelnes Vergleichsmaß reicht für Managemententscheidungen nicht aus.

Empfehlung: Für jedes Profil mindestens vier Größen betrachten:
- kleinster gemeinsamer Nenner
- zwei praxisnahe mittlere Größen
- größter gemeinsamer Nenner

Genau das macht Fensterradar jetzt.

### Verglasung

Verglasung ist kein reiner Fixpreis. Je nach Glasdatensatz kann der Zuschlag flächenabhängig oder prozentual sein. 3-fach wird bei großen Fenstern dadurch überproportional wichtiger. Für Angebotsstrategie heißt das:
- kleine Fenster: Profilpreis und Grundkalkulation dominieren stärker
- große Fenster: Glas-/Flächenlogik wird relevanter
- Preisabstände zwischen 2-fach und 3-fach sollten pro Profil überwacht werden

## 4. Vergleich zu Fensterblick

Fensterblick wirkt im Radar technisch moderner/kompakter in der Preisantwort. Die API liefert direkt:
- Konfigurationskette
- sichtbare Labels
- exakte Maße
- Gesamtpreis
- Rabatt-Prozent

Aktuell beobachtet: Fensterblick nutzt im Radar durchgehend ca. 27% Rabatt auf den beobachteten Listenpreis.

Was DFS davon lernen kann:
- Bessere Transparenz pro Antwort: Preisbestandteile, Rabatt, Endpreis, Labels zusammen ausgeben.
- Maße und Konfiguration als lesbare Bestätigung zurückgeben.
- Weniger Preislogik im Frontend verteilen.

Kritisch bei Fensterblick:
- Auch dort kann der Konfigurator Maße anpassen. Ohne Prüfung auf exakte Maße wären Vergleiche falsch.
- Hoher Dauerrabatt kann den Listenpreis weniger aussagekräftig machen.

## 5. Vergleich zu Fensterversand

Fensterversand liefert Rabatte nicht immer als einfachen `discount`-Wert. In der API stehen Profilrabatte in `price.percentages[profileId]`. Gleichzeitig ist `total` oft bereits der Kundenpreis oder identisch mit `discountedTotal`. Für die Analyse muss der Listenpreis teilweise rückwärts berechnet werden.

Beobachtete Rabatte im aktuellen Radar u.a.:
- Aluplast Ideal 5000: 10%
- Aluplast Ideal 7000: 15%
- Aluplast Ideal 8000: 20%
- Veka 82 MD: 25%
- Kömmerling 88 MD: 35%

Was DFS davon lernen kann:
- Rabatte sollten technisch eindeutig als `listPrice`, `discountPercent`, `discountAmount`, `customerPrice` getrennt werden.
- Profilbezogene Rabattpflege ist strategisch sinnvoll, aber sie muss sichtbar und auditierbar sein.

Kritisch bei Fensterversand:
- Die Preisantwort ist semantisch unklarer: `total`, `discountedTotal`, `discount`, `percentages` müssen interpretiert werden.
- Ohne Rückrechnung kann man Rabatte übersehen oder falsch darstellen.

## 6. Kritische Punkte bei DFS

### 6.1 Preislogik ist zu verteilt

Basispreise, Glaszuschläge, Aufschlag, Rabatt und MwSt. sind nicht als ein klares Pricing-Modell dokumentiert. Das erschwert Kontrolle und Fehleranalyse.

**Risiko:** Vertrieb und Geschäftsführung können Preisunterschiede nicht schnell erklären.

### 6.2 `myPricePercent = 90` ist erklärungsbedürftig

Ein pauschaler 90%-Aufschlag ist technisch sichtbar, aber fachlich nicht transparent. Es ist unklar, ob das Marge, Kostenfaktor, Sicherheitsaufschlag oder historisch gewachsene Kalkulation ist.

**Risiko:** Schwierige Governance. Kleine Änderungen können große Auswirkungen haben.

### 6.3 Rabatte sitzen an mehreren Stellen

Drutex PVC kam aus `material_discount`, Aluplast aus `company-discout`, weitere Marken über Brand-Endpunkte. Das funktioniert, ist aber schwer zu auditieren.

**Risiko:** Rabattaktionen können inkonsistent gepflegt oder übersehen werden.

### 6.4 Glasdaten je Profil können inkonsistent sein

Frühere Prüfungen zeigten leere/unvollständige Glasgruppen bei einzelnen Profilen. Wenn Glasdaten fehlen oder falsch gepflegt sind, wird der Endpreis falsch.

**Risiko:** Fehlerhafte Angebote bei bestimmten Profil-/Glaskombinationen.

### 6.5 Gemeinsame Vergleichsgrößen sind nicht trivial

Die größte DFS-Größe ist nicht automatisch die größte vergleichbare Marktgröße. Anbieter haben unterschiedliche Grenzen und Rundungslogiken.

**Risiko:** Wettbewerbsvergleiche wirken korrekt, sind aber fachlich nicht vergleichbar.

## 7. Konkrete Verbesserungsvorschläge

### Priorität 1: Pricing-Audit-Objekt pro Konfiguration

Jede Preisberechnung sollte intern ein klares Objekt erzeugen:

- profileId / brandId / materialId
- requestedSize
- actualSize
- basePriceNet
- glassAddNet
- otherAddonsNet
- kalkulationsFaktor
- grossListPrice
- discountSource
- discountPercent
- discountValidUntil
- customerFinalPrice
- warnings

Das würde Debugging, Managementberichte und Angebotsprüfung stark verbessern.

### Priorität 2: Rabattzentrale schaffen

Rabatte sollten in einer zentralen, nachvollziehbaren Struktur gepflegt werden:

- Marke
- Material
- Profil optional
- Fenstertyp optional
- Prozent
- Gültigkeit
- Priorität
- Aktiv/Inaktiv

Aktuell muss man mehrere Quellen zusammendenken.

### Priorität 3: Preislogik dokumentieren

Eine interne Seite „Wie kalkuliert DFS Fensterpreise?“ mit Formel, Beispielen und Datenquellen wäre sehr wertvoll. Nicht für Kunden, sondern für Geschäftsführung, Vertrieb, IT.

### Priorität 4: Automatische Preisprüfungen

Wöchentlich sollten Stichproben laufen:
- 2-fach vs 3-fach je Profil
- klein/mittel/groß je Profil
- Rabatt korrekt aktiv
- keine gerundeten Maße
- keine fehlenden Glasgruppen

### Priorität 5: Wettbewerbslogik übernehmen, aber sauberer

Von Fensterblick lernen: klare Labels und direkte Preisantwort.  
Von Fensterversand lernen: profilbezogene Rabattstaffeln.  
DFS sollte beides verbinden, aber mit sauberer Semantik: Liste, Rabatt, Endpreis getrennt.

## 8. Empfehlung für Geschäftsführung

DFS sollte die Preislogik nicht nur als technische Konfiguratorfunktion behandeln, sondern als strategisches Pricing-System. Aktuell ist sie leistungsfähig, aber zu wenig transparent. Für operative Steuerung, Wettbewerbsanalyse und margenbewusste Rabattaktionen braucht es eine klar auditierbare Preisarchitektur.

Kurz gesagt: Die Berechnung funktioniert, aber sie sollte besser erklärbar, zentraler gepflegt und automatisch geprüft werden.

## 9. Sofortmaßnahmen

1. Fensterradar weiter als wöchentlichen Kontrollmonitor nutzen.
2. Preisbestandteile im DFS-Konfigurator exportierbar machen.
3. Rabattquellen konsolidieren und dokumentieren.
4. Glasdaten je Profil prüfen.
5. Für jedes Profil verbindliche Vergleichsgrößen definieren und regelmäßig gegen Wettbewerber validieren.
