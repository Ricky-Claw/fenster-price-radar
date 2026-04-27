# Discount Policy

Für Preisradar gilt:

1. `listTotal` / Bruttopreis vor Aktionsrabatt ist die primäre Vergleichszahl.
2. Gesehene Shop-Rabatte werden nur als Metadata gespeichert:
   - `discountedTotalObserved`
   - `observedDiscount`
   - `percentages`
3. Keine automatische Rabatt-Anwendung im Core-Preisvergleich.
4. Spätere App-Funktion: manuelle Rabattregeln mit Scope:
   - Anbieter
   - Marke
   - Profil
   - Material
   - Glas
   - Datum von/bis
   - Prozent oder fixer Betrag
5. Grund: Kampagnen gelten nicht immer auf jedes Profil/Material/Glas. Automatisch rabattierte API-Werte können sonst falsche Vergleichspreise erzeugen.
