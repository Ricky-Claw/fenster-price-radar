# Internes Briefing: Wie unser DFS-Fensterkonfigurator Preise bildet

Stand: 28.04.2026  
Perspektive: Deutscher-Fenstershop / eigene Konfigurator-Logik  
Gegenstand: Fenster-Konfigurator, insbesondere Kunststofffenster, Festverglasung, Dreh-/Dreh-Kipp und zweiflügelige Fenster.

## 1. Management-Zusammenfassung

Unser Fensterkonfigurator ist kein einfacher Preislisten-Rechner. Er arbeitet wie ein modulares Kalkulationssystem: Profil, Fenstertyp, Öffnungsart, Maße, Verglasung, Farben, Dichtungen, Zubehör, interne Zuschlagslogik, MwSt. und Aktionsrabatte greifen ineinander.

Die Grundlogik ist leistungsfähig, aber aus Sicht Geschäftsführung/Vertrieb/IT zu schwer sichtbar. Viele preisrelevante Regeln liegen verteilt in Daten-JSONs, API-Antworten und Frontend-JavaScript. Dadurch funktioniert die Kalkulation zwar operativ, ist aber schwer zu auditieren, schwer zu erklären und anfällig für stille Fehler bei Datenpflege oder Aktionen.

Kernaussage: Wir sollten den Konfigurator nicht nur als Shop-Frontend betrachten, sondern als zentrales Pricing-System. Dafür braucht es eine transparente Preisaufschlüsselung pro Konfiguration.

## 2. Wie der Konfigurator fachlich denkt

Eine Fensterkonfiguration besteht aus mehreren Ebenen:

1. Material, z.B. Kunststoff/PVC  
2. Hersteller/Marke, z.B. Drutex, Aluplast, Veka, Kömmerling  
3. Profil, z.B. Iglo 5 Classic, Ideal 4000, Softline 82 MD  
4. Fensterform/Fenstertyp, z.B. einteilig, zweiteilig, mit Oberlicht, Rundbogen usw.  
5. Öffnungsart je Flügel, z.B. Festverglasung, Dreh, Dreh-Kipp  
6. Maße und Aufteilung  
7. Verglasung und warme Kante  
8. Farben/Dichtungen/Zubehör  
9. Kalkulationsaufschlag, MwSt., Rabatt

Wichtig: Der Preis hängt nicht nur am Profil. Er hängt daran, welche Kombination aus Profil, Typ, Öffnung, Größe und Glas gewählt wird.

## 3. Preisbasis: Profil + Öffnungsart + Maßmatrix

Für jedes Profil gibt es Preis-Matrizen. Die API `POST /konfigurator/fenster` liefert abhängig von:

- `bid` = Hersteller/Brand
- `mid` = Material
- `pid` = Profil
- `wid` = Fenstertyp
- `open_ids` / `opid` = Öffnungsarten
- Breite/Höhe bzw. Aufteilungen

Die Matrix enthält für konkrete Breite/Höhe-Kombinationen Basispreise. Wenn ein Maß nicht exakt existiert, kann der Konfigurator den nächstgrößeren Eintrag finden. Für Kundenbestellung kann das funktionieren, für Controlling und Wettbewerbsvergleich ist es aber kritisch: Gerundete Preise sind keine exakten Vergleichspreise.

## 4. Öffnungsarten: Festverglasung vs Dreh vs Dreh-Kipp

Die Öffnungsart verändert die Basispreis-Matrix deutlich.

Beispiel Drutex Iglo 5 Classic bei 1000×1200 mm aus der Live-Matrix:

- Festverglasung: ca. 73,18 Basispreis
- Dreh links/rechts: ca. 119,42 Basispreis
- Dreh-Kipp: ca. 127,15 Basispreis

Das ist fachlich plausibel: Festverglasung ist konstruktiv einfacher, Dreh und Dreh-Kipp benötigen Beschläge, Flügelmechanik und mehr Komponenten.

Empfehlung: In internen Reports müssen Fest, Dreh und Dreh-Kipp getrennt ausgewertet werden. Ein Profil kann bei Festverglasung sehr wettbewerbsfähig sein, bei Dreh-Kipp aber anders stehen.

## 5. Zweiflügelige Fenster und Aufteilungen

Bei zweiflügeligen Fenstern reicht die Gesamtbreite nicht aus. Der Konfigurator zerlegt die Gesamtgröße in Teilflächen bzw. Flügelbreiten und berechnet die Öffnungen je Flügel.

Im JavaScript ist sichtbar:

- `windowtype.count_window` bestimmt die Anzahl Flügel/Felder.
- `size_width` und `size_height` speichern Aufteilungen.
- `getPriceByOpens` sucht pro Öffnung/Teilmaß den passenden Preis.
- Für mehrere Flügel werden Teilpreise addiert.
- Bei bestimmten zweiflügeligen Logiken wird ein Koeffizient angewendet, z.B. bei Fenstertyp 6.

Das bedeutet: Ein zweiflügeliges Fenster ist nicht einfach „ein großes Fenster mal Faktor X“. Es ist eine Summe aus Teilpreisen, Öffnungsarten, Aufteilung und ggf. Koeffizienten.

Kritisch: Wenn Aufteilungen nicht sauber gespeichert oder sichtbar sind, kann Vertrieb später nicht erklären, warum zwei gleiche Gesamtmaße unterschiedliche Preise haben.

## 6. Verglasung: warum Glas stark mit Größe korreliert

Die Verglasung kommt aus profilbezogenen Glasdaten, z.B. `data_window_glass_<profileId>.json`.

Glaszuschläge können unterschiedlich berechnet werden:

- fester Betrag
- Prozent auf aktuellen Preis
- Preis pro m²
- Preis pro laufendem Meter
- Zuschlag nach Breite oder Höhe

Deshalb wächst der Unterschied zwischen 2-fach und 3-fach nicht immer linear. Bei kleinen Fenstern dominiert eher der Grundpreis. Bei großen Fenstern wirkt die Glasfläche stärker.

Management-Relevanz: Die Marge und Wettbewerbsfähigkeit von 3-fach-Verglasung muss getrennt von 2-fach betrachtet werden. Ein Durchschnitt über alle Gläser verschleiert wichtige Effekte.

## 7. Farben, Dichtungen und Zubehör

Neben Profil, Größe und Glas gibt es weitere preisrelevante Ebenen:

- Farbe außen/innen
- Dichtungsfarbe
- warme Kante
- Sprossen
- Fensterbankanschluss
- Zubehör/Beschläge
- Rollladen/Extras

Im JavaScript ist sichtbar, dass Dichtungen und Zubehör prozentuale oder feste Aufpreise auslösen können. Beispiel: bestimmte Dichtungsfarben können mit Prozentzuschlägen versehen werden.

Für das aktuelle Fensterradar ist bewusst eine Standardkonfiguration gewählt: PVC, weiß/weiß, einflügelig, Dreh-Kipp bzw. definierte Vergleichslogik. Für eine vollständige DFS-Steuerung sollten später Farben und Zubehör separat überwacht werden.

## 8. Kalkulationsaufschlag und MwSt.

Im Konfigurator wird `window.myPricePercent = 90` gesetzt. Dieser Wert fließt als interner Aufschlag in die Preisbildung ein.

Vereinfacht:

1. Basispreis aus Matrix
2. Zuschläge aus Glas/Zubehör/Farbe usw.
3. interner Prozentaufschlag
4. 19% MwSt.
5. Aktionsrabatt auf den Brutto-/Endpreis

Kritisch: Ein pauschaler Aufschlagswert ist betriebswirtschaftlich erklärungsbedürftig. Er kann historisch richtig sein, sollte aber dokumentiert werden: Welche Kosten/Marge deckt er ab? Gilt er für alle Marken/Profile gleich? Gibt es Ausnahmen?

Im JS sind Sonderregeln sichtbar, z.B. andere Prozentwerte bei bestimmten Profilen, Marken oder sehr großen Aluplast-Konfigurationen. Das ist fachlich möglich, muss aber dokumentiert und auditierbar sein.

## 9. Rabatte und Aktionen

Rabatte liegen aktuell an mehreren Stellen:

- Materialrabatt, z.B. Drutex PVC 15% bis 31.05.2026
- Markenrabatt, z.B. Aluplast 5% bis 31.05.2026
- weitere Brand-Rabatte über `/windows/company-discout?bid=...&conf=windows`

Aktuelle beobachtete DFS-Rabatte im Radar:

- Drutex PVC: 15%
- Aluplast: 5%
- Gealan: 20%
- Salamander: 25%
- Veka: 20%
- Kömmerling: 35%

Kritisch: Rabatte funktionieren, aber sie sind nicht als zentrale Rabattmatrix sichtbar. Für Geschäftsführung wäre wichtig, jederzeit zu sehen:

- Welche Aktion läuft?
- Für welche Marke/Material/Profile?
- Bis wann?
- Mit welcher Priorität?
- Wie wirkt sie auf Marge und Wettbewerbsabstand?

## 10. Was aktuell gut ist

- Der Konfigurator kann viele komplexe Fenstertypen abbilden.
- Profil- und Öffnungslogik ist granular genug für echte Maßfenster.
- Glas und Zubehör sind modular erweiterbar.
- Rabatte können nach Marke/Material gesteuert werden.
- Die Live-Preisberechnung reagiert dynamisch auf Maße und Optionen.

## 11. Was kritisch ist

### 11.1 Zu wenig erklärbare Preisaufschlüsselung

Intern sieht man nicht auf einen Blick: Basispreis, Glaszuschlag, Zubehör, Aufschlag, MwSt., Rabatt, Endpreis.

### 11.2 Verteilte Rabattlogik

Rabatte liegen in mehreren Quellen. Das erhöht Risiko für falsch laufende Aktionen.

### 11.3 Komplexe Mehrflügel-Logik

Zweiflügelige Fenster werden über Teilpreise und Aufteilungen kalkuliert. Ohne transparente Darstellung ist das schwer zu kontrollieren.

### 11.4 Sonderregeln im JavaScript

Sonderfälle wie Profil-/Brand-Ausnahmen oder große Aluplast-Konfigurationen sind technisch sichtbar, aber nicht managementgerecht dokumentiert.

### 11.5 Datenqualität bei Glasdaten

Wenn Glasgruppen pro Profil fehlen oder falsch gepflegt sind, entstehen falsche Endpreise. Das muss regelmäßig geprüft werden.

## 12. Empfehlungen aus DFS-Sicht

### Empfehlung 1: Preisaufschlüsselung pro Konfiguration einführen

Jede Konfiguration sollte intern eine verständliche Breakdown-Struktur erzeugen:

```json
{
  "profile": "Iglo 5 Classic",
  "windowType": "Einteiliges Fenster",
  "opening": "Dreh-Kipp",
  "requestedSize": "1000x1200",
  "actualSize": "1000x1200",
  "basePrice": 127.15,
  "glassAdd": 23.50,
  "colorAdd": 0,
  "accessoryAdd": 0,
  "calculationPercent": 90,
  "grossListPrice": 342.51,
  "discountPercent": 15,
  "discountSource": "Drutex PVC Aktion",
  "customerFinalPrice": 291.13
}
```

### Empfehlung 2: Eigene Admin-Ansicht „Preisprüfung“ bauen

Für Geschäftsführung/Vertrieb/IT sollte es eine interne Ansicht geben:

- Eingabe Profil, Fenstertyp, Öffnung, Größe, Glas
- Ausgabe Preisbestandteile
- Warnung bei Maßrundung
- Anzeige aktiver Rabatt
- Vergleich 2-fach/3-fach

### Empfehlung 3: Fest, Dreh und Dreh-Kipp separat monitoren

Der Preisabstand zwischen Festverglasung und Dreh-Kipp ist strategisch relevant. Kunden vergleichen oft Endpreise, aber intern müssen wir wissen, wo Beschlag-/Mechanikaufschläge wirken.

### Empfehlung 4: Zweiflügelige Fenster als eigene Benchmark-Kategorie aufnehmen

Fensterradar sollte als nächste Ausbaustufe nicht nur einflügelig DK betrachten, sondern zusätzlich:

- einflügelig Fest
- einflügelig Dreh-Kipp
- zweiflügelig Fest/Fest
- zweiflügelig DK/Fest oder DK/DK je nach DFS-Standard

### Empfehlung 5: Rabattmatrix zentralisieren

Alle Rabatte sollten aus einer zentralen Matrix kommen:

- Marke
- Material
- Profil optional
- Fenstertyp optional
- Prozent
- Gültigkeit
- Priorität
- Quelle/Bemerkung

### Empfehlung 6: Sonderregeln dokumentieren

Alle Sonderfälle im Code sollten in einer Pricing-Dokumentation stehen:

- abweichende Prozentaufschläge
- Profil-Hacks
- Größen-Sonderfälle
- Marken-Ausnahmen

## 13. Fazit für Geschäftsführung

Unsere DFS-Konfiguratorlogik ist leistungsfähig, aber aktuell eher technisch gewachsen als managementfähig dokumentiert. Der wichtigste nächste Schritt ist nicht, die komplette Logik neu zu bauen, sondern sie sichtbar zu machen.

Wenn wir pro Konfiguration klar zeigen können, wie der Endpreis entsteht, gewinnen wir:

- bessere Preissteuerung
- schnellere Fehleranalyse
- bessere Rabattkontrolle
- bessere Wettbewerbsfähigkeit
- mehr Vertrauen im Vertrieb

Kurz: Der Konfigurator funktioniert. Jetzt sollte er als transparentes Pricing-System weiterentwickelt werden.
