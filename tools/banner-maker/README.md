# Werbebanner-Generator

Erstellt freigabefähige DFS-Werbebanner aus dem Aktionskalender oder einem Ad-hoc-Brief.

```bash
npm run banner:make -- --aktion ruhiges-heimspiel
npm run banner:make -- --config tools/banner-maker/example-adhoc.json
npm run banner:make -- --size leaderboard,300x250
npm run banner:make -- --motiv pfad.jpg
```

Die Dateien liegen standardmäßig in `tools/banner-maker/out/` und sind gitignored. Jedes Ergebnis passiert ein hartes Gate: exakt angeforderte Maße und höchstens 150 KB.

Motive gehören nach `tools/banner-maker/motive/<aktion-id>/`; die alphabetisch erste JPG- oder PNG-Datei wird verwendet. Empfohlen sind ruhige Querformat-Motive ab 1600 px Breite ohne Text im Bild.

Output niemals nach `public/` legen: Dort wäre er sofort öffentlich. Banner erst nach Freigabe durch Elvis zu Google Ads hochladen.
