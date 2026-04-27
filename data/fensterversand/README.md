# Fensterversand PVC Preisstruktur

Status: MVP-Basis für `fenster-price-radar`.

## Quelle

- Live-Endpoint: `POST https://www.fensterversand.com/configurator/update`
- Produkt: Kunststofffenster `productId=25`
- Startseite: `https://www.fensterversand.com/?cid=25&t=fenster-kunststoff`

## Dateien

- `pvc-default-payload.json`
  - Captured Default-Konfiguration von Fensterversand.
  - Breite = `a_258`, Höhe = `a_259`.
  - Profil/Glas/Farbe Mapping noch offen.

- `../pvc-benchmark-from-excel.json`
  - Aus Elvis' Excel extrahierter Startkatalog.
  - Nur PVC-nahe Profile/Größen.

## Script

```bash
npm run fv:pvc -- --limit=6
```

Erzeugt:

```txt
results/fensterversand-pvc-*/results.json
```

## Erste validierte API-Ergebnisse

Mit Default-PVC-Profil von Fensterversand:

- 600×600 → `86,57 €` discounted, 25% Rabatt
- 950×1450 → `143,69 €` discounted, 25% Rabatt
- 1000×2100 → `179,39 €` discounted, 25% Rabatt

## Nächste Aufgabe

Option-ID Mapping bauen:

- Hersteller/Profil: Aluplast, Drutex, Veka, Kömmerling etc.
- Glas: 2-fach / 3-fach
- Farbe: weiß / anthrazit etc.
- Öffnungsart: Fest / Dreh-Kipp

Dafür `/configurator/start?id=25&t=fenster-kunststoff` HTML/JSON parsen und UI-Aktionen gezielt mitschneiden.
