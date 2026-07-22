# Meta-Radar — Ads-Puls + Konkurrenz-Blick

Kleiner Agent für die Meta-Werbewelt von Deutscher Fenstershop. Zwei Teile:

- **A) Eigene Kampagnen** (Stufe 2, braucht Zugang): zieht Spend, Impressionen, CTR, Leads und CPL je Kampagne der letzten 7 Tage über die Meta Marketing API.
- **B) Konkurrenz-Blick** (sofort nutzbar): baut Deeplinks in die **Meta Ad Library** (Werbebibliothek) — dort sind ALLE aktiven Anzeigen jeder Seite öffentlich einsehbar, in der EU inkl. Archiv inaktiver Anzeigen. Kein Login nötig.

## Nutzung

```bash
npm run meta:radar
```

Report landet unter `results/meta-radar/report-YYYY-MM-DD.md` (gitignored) und im Terminal. Wettbewerber-Liste pflegen: `tools/meta-radar/konkurrenz.json`.

## Stufe 2 aktivieren (eigene Kampagnen-Zahlen)

Braucht zwei Werte als Env (lokal in `.env`, später VPS-Cron — **nie ins Repo/Chat**):

1. `META_AD_ACCOUNT_ID` — die Werbekonto-Nummer (im Ads Manager oben, mit oder ohne `act_`).
2. `META_ACCESS_TOKEN` — System-User-Token mit Berechtigung `ads_read`:
   Business Manager → Unternehmenseinstellungen → System-Nutzer → anlegen → dem Werbekonto zuweisen (Rolle „Analyst" reicht) → Token generieren (`ads_read`), Laufzeit „nie ablaufend".

Übergabeweg für die Werte: wie gehabt über den Codex-Secrets-Weg, nicht im Chat.

Optional `META_DATE_PRESET` (Default `last_7d`, z. B. `last_30d`).

## Ausbaustufe (nach Token)

Wöchentlicher VPS-Cron auf nexus-host (Muster Fensterradar-Weekly): Montag früh `npm run meta:radar`, Report per Mail an Elvis / ins Repo. Einrichtung erst, wenn Token auf dem VPS liegt.

## Leitplanken

- Token nur Env; Script gibt nie Token oder URLs mit Token aus.
- Konkurrenz-Daten kommen ausschließlich aus der öffentlichen Ad Library (DSA-Transparenz) — kein Scraping hinter Login.
- Zahlen im Report sind Meta-Rohdaten; keine erfundenen Benchmarks.
