# Fensterversand Mapping Status

Scope: PVC Fenster, keine Balkontüren, keine automatische Rabattberechnung.

## Preis-Policy

- Vergleich nutzt `comparePrice.listTotal` = Brutto/Listpreis vor Rabatt.
- Observed Shop-Rabatte werden nur als Metadata gespeichert.
- App bekommt später manuelle Rabattregeln mit Scope.

## Fertig gemappt

- Material: `a_132`
  - Kunststoff = `834`
- System/Marke: `a_2471`
  - Aluplast = `14232`
  - Kömmerling = `14231`
  - Veka = `17315`
- Profil: `a_133`
  - Aluplast: Ideal 4000 `838`, Ideal Neo AD `14152`, Ideal Neo MD `14153`, Ideal 7000 `8641`, Ideal 8000 `840`, Energeto Neo `14154`, Energeto 8000 `11373`
  - Kömmerling: 70 AD `14235`, 76 AD `14237`, 76 MD `14239`, 88 MD `14241`
  - Veka: Softline 70 AD `17317`, 76 MD `17319`, 82 MD `17321`, 82 MD Passive `17323`
- Glas: `a_186`
  - 2fach Standard Ug 1,1 = `1238`
  - 2fach Ug 1,0 = `1239`
  - 3fach Standard Ug 0,7 = `1240`
  - 3fach Ug 0,6 = `1241`
  - 3fach Ug 0,5 = `14364`
- Fenstertyp/Öffnung: `a_157`
  - Fest = `1020`
  - Dreh-Kipp links = `1021`
  - Dreh-Kipp rechts = `1022`
  - Kipp = `2150`
- Farbe Basis: `a_136`
  - Weiß = `844`
  - Anthrazit beidseitig = `849`
  - außen anthrazit / innen weiß needs separate inside/outside-color attributes later.
- Maße:
  - Breite = `a_258`
  - Höhe = `a_259`

## Erste Tests

Script:

```bash
npm run fv:pvc:mapped -- --limit=30
```

Ergebnis aus Excel-Startkatalog:

- 12 gematchte Fensterversand-Preise (Aluplast Profile)
- 18 unmatched (hauptsächlich Drutex; Fensterversand hat im PVC-Flow offenbar kein Drutex)
- 2000x2000 DK liefert teils `0`, vermutlich konfiguratorseitig unzulässig/andere Typ-Aufteilung nötig.

## Nächste Lücken

1. Außen anthrazit / innen weiß sauber mappen.
2. 2-flügelig/Stulp aus weiteren Attributen extrahieren.
3. Veka/Kömmerling aus mehr Excel-Zeilen testen.
4. Drutex bei Fensterversand bleibt unmatched, weil Sortiment dort nicht sichtbar vorhanden.
