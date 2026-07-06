# Price Radar Quality Rules

Stand: 2026-05-11

## Hard rules

1. **Live source proof**
   - Preisupdates laufen über die Provider-Skripte:
     - DFS: eigener Konfigurator/API
     - Fensterblick: `api.configurator.fensterblick.de`
     - Fensterversand: `fensterversand.com/configurator/update`
   - Nach jedem Update müssen die Result-Ordner im `sources` Block von `public/data/price-radar.json` auf den aktuellen Lauf zeigen.

2. **Vorwochenvergleich darf nie Same-Day-Sync sein**
   - `weeklyChange` muss gegen den letzten früheren History-Snapshot laufen, nicht gegen `public/data/price-radar.json` vom selben Tag.
   - `comparisonBaseline.snapshot` muss auf `public/data/history/price-radar-YYYY-MM-DD.json` vor dem aktuellen Datum zeigen, sofern vorhanden.

3. **Endpreis zählt für Wettbewerbsänderungen**
   - Die UI zeigt Kunden-Endpreise. Deshalb muss `weeklyChange.delta` den `customerTotal` vergleichen.
   - Listenpreisänderungen bleiben zusätzlich als `listDelta` erhalten.

4. **Rabatte sichtbar halten**
   - Wenn ein Anbieter einen `discountedTotal` liefert, muss der Endpreis als `customerTotal` gespeichert werden.
   - Rabatt-/Endpreis-Metadaten müssen im Provider-Drawer sichtbar bleiben.

5. **Kein Done ohne Gates**
   - Nach jedem Preisupdate laufen:
     - `npm run prices:update`
     - `npm run build`
   - `prices:update` enthält `verify:prices`; Fehler blockieren Commit/Push.

6. **Verifizierungs-Badges nur aus Live-Stichproben**
   - Ein Per-Config-Badge darf nur aus einem echten Live-Abgleich über `npm run verify:sample` entstehen.
   - Kein `data/verification.json`-Entry bedeutet kein Badge.
   - Bei Preisabweichung wird die Konfiguration als sichtbares Mismatch geführt, nie als grünes Badge.
   - `verify:prices` bricht bei Zombie-Keys, abweichender `samples`-Zählung oder nicht reproduzierbaren Badges ab.
   - `verify:sample` läuft getrennt von `prices:update` und darf den Wochen-Snapshot nie blockieren.

## Failure lesson

Am 2026-05-11 wurde der Wochenvergleich zunächst gegen einen Same-Day-Sync statt gegen die echte Vorwoche gerechnet. Dadurch zeigte die App fälschlich 0 Preisänderungen, obwohl Fensterversand-Endpreise live gefallen waren.

Prevention: `scripts/sync-results.js` wählt jetzt den letzten History-Snapshot vor dem aktuellen Datum als Baseline. `scripts/verify-price-radar.js` blockiert Same-Day-Baselines und prüft, dass Wochenänderungen auf aktuellen Kunden-Endpreisen basieren.
