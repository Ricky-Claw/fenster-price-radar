# Briefing: Preislogik von Fensterblick und Fensterversand – Learnings für DFS

Stand: 28.04.2026  
Quelle: Fensterradar v1, Live-API-Abfragen, Anbieter-Konfigurator-Endpunkte, aktuelle Rabatt-/Preisantworten.

## 1. Kurzfazit

Fensterblick und Fensterversand arbeiten beide stärker mit klaren Konfigurations-APIs als DFS, aber sie lösen Preislogik unterschiedlich:

- **Fensterblick** ist aus technischer Sicht sehr sauber im Konfigurationsfluss: Initialisierung, Schrittwechsel, Maßeingabe und Preisupdate sind klar getrennt. Die API liefert gut lesbare Labels, Konfigurationsketten, Endpreise und einen eindeutigen Rabattwert.
- **Fensterversand** arbeitet mit einem großen, attributbasierten Payload-Modell. Die Preisantwort enthält `total`, `discountedTotal` und profilbezogene Rabatt-Prozente in `price.percentages`. Das ist mächtig, aber semantisch unklarer.

Empfehlung für DFS: Fensterblicks klare Konfigurationsantworten und Fensterversands profilbezogene Rabattstaffeln übernehmen – aber in DFS mit besserer Semantik: Listenpreis, Rabatt, Rabattquelle und Kunden-Endpreis strikt getrennt.

## 2. Fensterblick: Wie die Logik aufgebaut ist

### 2.1 Konfigurationsfluss

Fensterblick arbeitet in drei klaren Schritten:

1. **Initialisierung**  
   `POST /configurations/init-configuration`  
   Übergibt Material und Profil.

2. **Schrittwechsel**  
   `POST /configurations/process-step-change`  
   Wird genutzt für Verglasung, Öffnungsrichtung, Farbe usw.

3. **Maß-/Preisupdate**  
   `POST /configurations/process-input-change`  
   Übergibt Breite, Höhe, Flügelbreiten und aktuelle Konfigurationskette.

Die API arbeitet mit:
- `config_chain`
- `ref_id_chain`
- `inputs`
- `prices.total`
- `prices.short_labels`
- `discount_percent`

### 2.2 Preis- und Rabattlogik

Im aktuellen Radar liefert Fensterblick bei allen gültigen Fensterblick-Treffern einen Rabatt von ca. **27%**.

Beispiel aus Radar:
- Drutex Iglo 5 Classic, 415×500, 2-fach
- Listen-/Ausgangspreis: 169,16 €
- Kundenpreis nach Rabatt: 123,49 €
- Rabatt: 27%

Die API macht den Rabatt vergleichsweise leicht auswertbar, weil `discount_percent` direkt vorhanden ist.

### 2.3 Stärken von Fensterblick

- **Sehr klare Konfigurationskette**  
  Man kann nachvollziehen, welche Auswahl aktiv ist.

- **Labels direkt aus der API**  
  `short_labels` bestätigen Profil, Öffnung, Maße, Farbe und Glas. Das ist wertvoll für Angebotsprüfung.

- **Rabatt als eigenes Feld**  
  `discount_percent` ist besser als versteckte Rabatte in mehreren Datenquellen.

- **Maßprüfung möglich**  
  Die API gibt die tatsächlichen Maße zurück. Dadurch kann man erkennen, ob der Konfigurator Maße angepasst hat.

### 2.4 Schwächen/Risiken bei Fensterblick

- **Dauerrabatt wirkt wie Standardpreis**  
  Wenn 27% dauerhaft aktiv sind, verliert der Listenpreis an Aussagekraft.

- **Maßanpassungen möglich**  
  Ohne Vergleich `requestedSize` vs. `actualSize` kann man falsche Vergleichspreise ziehen.

- **Indexbasierte Step-Auswahl**  
  Verglasung/Öffnung werden über Schrittindizes ausgewählt. Wenn sich Reihenfolgen ändern, kann Mapping brechen.

## 3. Fensterversand: Wie die Logik aufgebaut ist

### 3.1 Konfigurationsmodell

Fensterversand nutzt für Kunststofffenster `productId=25` und sendet eine große `configuration`-Struktur an:

`POST /configurator/update`

Wichtige Attribute im Radar:
- `a_132` Material Kunststoff
- `a_2471` Marke/Brand
- `a_133` Profil
- `a_258` Breite
- `a_259` Höhe
- `a_186` Glas
- `a_136` Farbe
- `a_157` Öffnung

Die Logik ist also weniger schrittbasiert, mehr ein direkter Attribut-Payload.

### 3.2 Preis- und Rabattlogik

Die Preisantwort enthält u.a.:
- `price.total`
- `price.discountedTotal`
- `price.discount`
- `price.percentages`

Wichtig: Bei Fensterversand ist `discountedTotal` häufig identisch mit `total`. Der Rabatt steckt dann nicht zwingend in `discount`, sondern in:

`price.percentages[profileId]`

Im Fensterradar wird deshalb der Listenpreis teilweise rückwärts berechnet:

`Listenpreis = Kundenpreis / (1 - RabattProzent)`

Beobachtete Rabattstaffeln im aktuellen Radar:
- Aluplast Ideal 4000: 0%
- Aluplast Ideal 5000: 10%
- Aluplast Ideal 7000: 15%
- Aluplast Ideal 8000: 20%
- Veka 82 MD: 25%
- Kömmerling 88 MD: 35%

### 3.3 Stärken von Fensterversand

- **Profilbezogene Rabattstaffeln**  
  Rabatte können granular pro Profil gesteuert werden.

- **Ein einziger Update-Endpunkt**  
  Die ganze Konfiguration wird als Payload gesendet. Das ist technisch robust für Preisupdates.

- **Attributmodell ist skalierbar**  
  Viele Produktoptionen können in derselben Struktur gepflegt werden.

- **Rabattmatrix sichtbar**  
  `price.percentages` erlaubt eine schnelle Übersicht, welche Profile rabattiert sind.

### 3.4 Schwächen/Risiken bei Fensterversand

- **Semantik der Preisfelder ist unklar**  
  `total` und `discountedTotal` sind oft gleich. Ohne Zusatzlogik weiß man nicht, ob `total` Liste oder Endpreis ist.

- **Rabatt muss interpretiert werden**  
  Der eigentliche Profilrabatt sitzt in `percentages`, nicht zuverlässig in `discount`.

- **Attribut-IDs sind schwer lesbar**  
  `a_133`, `a_186`, `a_157` sind technisch, aber nicht management- oder vertriebsfreundlich.

- **Mapping-Pflege ist aufwendig**  
  Jede Option braucht eine saubere Übersetzung von ID zu Bedeutung.

## 4. Vergleich zu DFS

### 4.1 DFS heute

DFS hat eine modulare, leistungsfähige Logik:
- Preis-Matrix je Profil/Öffnungsart/Größe
- Glasdaten je Profil
- Kalkulationsaufschlag über `myPricePercent = 90`
- MwSt.
- Rabattquellen über Material- und Brand-Discounts

Aber: Die Logik ist verteilt und nicht als ein geschlossenes Preisobjekt sichtbar.

### 4.2 Was Fensterblick besser macht

Fensterblick liefert eine bessere erklärbare Antwortstruktur:
- aktive Konfiguration
- sichtbare Labels
- actual dimensions
- Preis
- Rabatt

**Übernehmen:** DFS sollte pro Preisberechnung eine strukturierte Antwort erzeugen, die alle Bestandteile enthält.

### 4.3 Was Fensterversand besser macht

Fensterversand kann profilbezogene Rabattstaffeln gut abbilden.

**Übernehmen:** DFS sollte Rabattlogik zentral und profil-/marken-/materialbezogen steuerbar machen, mit klarer Priorität.

### 4.4 Was DFS besser machen kann als beide

DFS kann beide Ansätze kombinieren:
- klare Fensterblick-artige Preisantwort
- Fensterversand-artige Rabattmatrix
- plus saubere DFS-interne Kalkulationslogik und Auditierbarkeit

## 5. Konkrete Empfehlungen für DFS

### Empfehlung 1: Einheitliches Pricing-Response-Objekt

Jede DFS-Konfiguration sollte intern und optional per Admin/API ein Objekt liefern:

```json
{
  "requestedSize": "1000x1200",
  "actualSize": "1000x1200",
  "brand": "Drutex",
  "profile": "Iglo 5 Classic",
  "opening": "Dreh-Kipp",
  "glazing": "3fach",
  "basePriceNet": 123.45,
  "glassAddNet": 25.00,
  "calculationFactorPercent": 90,
  "vatPercent": 19,
  "grossListPrice": 342.51,
  "discountPercent": 15,
  "discountSource": "Drutex PVC Aktion",
  "discountValidUntil": "31.05.2026",
  "customerFinalPrice": 291.13,
  "warnings": []
}
```

Das wäre für IT, Geschäftsführung und Vertrieb sofort verständlich.

### Empfehlung 2: Rabattmatrix zentralisieren

Statt Rabatte aus mehreren Stellen zusammenzuziehen, sollte DFS eine zentrale Rabattmatrix haben:

- Brand
- Material
- Profil optional
- Fenstertyp optional
- Prozent
- Gültigkeit
- Priorität
- Quelle/Bemerkung

Priorität z.B.:
1. Profilrabatt
2. Markenrabatt
3. Materialrabatt
4. globaler Rabatt

### Empfehlung 3: Labels in Preisantwort aufnehmen

Wie Fensterblick sollte DFS maschinenlesbar und menschenlesbar zurückgeben:
- Profilname
- Maße
- Glas
- Öffnung
- Farbe
- Warnung bei Rundung/Anpassung

Das reduziert Fehler in Angeboten und im Support.

### Empfehlung 4: Rabatt nicht nur optisch, sondern technisch sauber trennen

Jeder Preis sollte getrennt speichern:
- Listenpreis brutto
- Rabattbetrag
- Rabattprozent
- Endpreis brutto
- Rabattgültigkeit

Dadurch kann Vertrieb erklären: „Liste X, Aktion Y%, Kunde zahlt Z.“

### Empfehlung 5: Wettbewerbsmonitor als Frühwarnsystem nutzen

Fensterradar sollte wöchentlich prüfen:
- Hat ein Wettbewerber Rabatt geändert?
- Ist DFS bei bestimmten Profilen nach Rabatt zu teuer?
- Ändert sich der Abstand bei 3-fach stärker als bei 2-fach?
- Gibt es Profil-/Größenbereiche, in denen DFS systematisch schlechter steht?

## 6. Was DFS konkret übernehmen sollte

| Quelle | Übernehmen | Warum |
|---|---|---|
| Fensterblick | `short_labels`/Konfigurationsbestätigung | bessere Nachvollziehbarkeit |
| Fensterblick | explizites `discount_percent` | Rabatt einfacher auswertbar |
| Fensterblick | tatsächliche Maße in Antwort | verhindert falsche Vergleichspreise |
| Fensterversand | profilbezogene Rabattmatrix | bessere Aktionssteuerung |
| Fensterversand | einheitlicher Update-Payload | skalierbar für viele Optionen |
| DFS selbst | Matrix + Glaslogik | leistungsfähig, behalten |

## 7. Was DFS nicht übernehmen sollte

- Von Fensterblick: dauerhafte hohe Rabatte ohne klare Aktionskommunikation.
- Von Fensterversand: unklare Semantik zwischen `total`, `discountedTotal` und `percentages`.
- Von beiden: Preisantworten, die ohne technische Interpretation nicht managementfähig sind.

## 8. Management-Fazit

Fensterblick ist stärker in Transparenz und Bestätigung der gewählten Konfiguration. Fensterversand ist stärker in profilbezogener Rabattsteuerung. DFS hat eine gute Basislogik, sollte aber die Preisantwort und Rabattpflege professionalisieren.

Die größte Chance liegt nicht darin, Preise blind an Wettbewerber anzupassen, sondern die eigene Preisarchitektur sauber sichtbar zu machen. Dann kann DFS gezielt entscheiden, wo Marge verteidigt wird und wo Aktionen nötig sind.

## 9. Nächste Schritte

1. DFS Pricing-Response-Objekt definieren.
2. Rabattmatrix konsolidieren.
3. Admin-/Management-Ansicht für Preisbestandteile bauen.
4. Wöchentlichen Wettbewerbsbericht aus Fensterradar erzeugen.
5. Auffällige Profil-/Glas-/Größenkombinationen priorisiert prüfen.
