# Tool-Export

Ein Manifest liegt unter `tools/migrate/manifests/<tool>.json`. Pflichtfelder sind
`name`, `title`, `description`, ein nicht-leeres `files`-Array und entweder
`version` oder `versionFrom` (Pfad zur Tool-`package.json`). Optional sind:

- `exclude`: Glob-Array
- `forbiddenTerms`: case-insensitive verbotene Teilstrings für den Content-Leak-Scan
- `envVars`: `{ "name", "required", "description" }`-Objekte
- `modes.embed`: `{ "snippet", "notes" }`
- `modes.selfhost`: `{ "steps": [], "notes" }`
- `cmsNotes` und `dsgvoNotes`: String-Arrays

```sh
npm run tool:export -- <tool>
npm run tool:export -- <tool> --zip
```

Pfade sind relativ zur Repo-Wurzel. Globs unterstützen nur `*`, `**` und `?`;
Zeichenklassen (`[...]`) werden abgelehnt. Als Tool-Wurzel gilt der gemeinsame
statische Pfadpräfix aller Include-Globs. Nur durch Git versionierte Dateien werden
exportiert, und jeder Include-Glob muss mindestens eine solche Datei treffen.
`exclude` wird vor der Denylist angewendet.

Exporte landen in `tools/migrate/out/`. Die Denylist vergleicht
case-insensitive und sperrt unter anderem `.env`/`.env.*` (außer exakt der Endung
`.env.example`), Datenbanken, Schlüssel, `node_modules`, `.git` sowie `data/`
als exaktes Verzeichnis-Segment im tool- oder repo-relativen Pfad.

Secret-, Content-Leak- und paketüberschreitende relative Import-Treffer brechen
den Export ab. Der Import-Scan prüft statische Imports, Exports, `import()` und
`require()` in `.js`, `.mjs` und `.cjs`; dynamisch zusammengesetzte
`require()`-Specifier sind außerhalb seiner Grenze.

## Automatische Releases

Die Action `Tool-Release` wird ausschließlich manuell gestartet; dieses
menschliche Gate ist vor jedem öffentlichen Release erforderlich. Der Input
`tool` ist standardmäßig `rueckhol-automatik`.

Jede Version wird unter `tool-<tool>-v<version>` veröffentlicht. Für den
Webdesigner bleibt zusätzlich dieser Link dauerhaft stabil:

```text
https://github.com/Ricky-Claw/fenster-price-radar/releases/download/tool-rueckhol-automatik-latest/rueckhol-automatik-latest.zip
```
