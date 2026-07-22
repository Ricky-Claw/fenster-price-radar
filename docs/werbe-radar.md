# Werbe-Radar — Konkurrenz-Anzeigen im Fensterradar (Plan, beschlossen 22.07.2026)

**Beschlüsse (Elvis):** Datenquelle NUR offizielle Meta Ad Library API (kein Scraping) · Wettbewerber: Fensterversand.com, fenster24.de, Sparfenster · nur Fakten, keine KI-Interpretation · eigener Tab neben dem Preisradar · wöchentliche Aktualisierung.

## Was der Tab zeigt (je Wettbewerber)

- Anzahl aktive Meta-Anzeigen (FB+IG) + Veränderung zur Vorwoche
- Neueste Anzeigentexte (Creative-Bodies, gekürzt) mit Laufzeit-Beginn
- Plattformen je Anzeige, EU-Reichweite (sofern von Meta geliefert)
- Klick-Link je Anzeige/Advertiser direkt in die Meta Ad Library
- Wochen-Historie als Snapshot-Reihe (Muster Preisradar: `public/data/werbe-radar.json` + `public/data/history/`)

Kein Spend/CTR — gibt die API für kommerzielle Anzeigen nicht her. Ehrliche Leerstände, wenn ein Wettbewerber nichts schaltet (Stand 22.07.: Fensterversand ~12 Ads, Fensterblick/Neuffer 0).

## Blocker: Meta-Entwicklerzugang (Elvis, einmalig, ~15 Min + 1–3 Tage Wartezeit)

1. Auf https://developers.facebook.com mit deinem Facebook-Konto anmelden → Entwicklerkonto anlegen.
2. **Identitätsbestätigung** durchführen (Ausweis-Upload, von Meta für den Ad-Library-API-Zugriff verlangt) — Meta führt dich unter https://www.facebook.com/ID durch. Bestätigung dauert typisch 1–3 Tage.
3. Auf https://www.facebook.com/ads/library/api den Zugangs-/Nutzungsbedingungen zustimmen.
4. Eine App anlegen (Typ „Sonstiges" reicht) und im Graph API Explorer einen Access Token erzeugen (langlebig tauschen zeigen wir beim Einrichten).
5. Token via Codex-Secrets-Weg übergeben (nie Chat) — Env-Name: `META_ADLIB_TOKEN`.

Hinweis: Meta ändert diese Abläufe gelegentlich — falls ein Schritt anders aussieht, Screenshot an die Session, wir führen durch.

## Bau-Reihenfolge (startet, sobald Token da)

1. **Fetcher** `tools/werbe-radar/fetch.mjs`: Graph-API `ads_archive` je Advertiser (Page-Suche → page_id → aktive Ads, Felder gegen echte API verifiziert), Snapshot nach `public/data/werbe-radar.json` + History. Bricht nie: API-Fehler ⇒ alter Snapshot bleibt, Fehlerzeile im Report.
2. **UI-Tab „Werbe-Radar"** in der Radar-App (gleiche Login-Hürde), Karten je Wettbewerber + Historien-Trend.
3. **Weekly-Cron** auf nexus-host (Muster Fensterradar-Weekly, Mo früh): fetch → data:sync-artiges Commit der `public/data`-Artefakte → Vercel deployt.
4. Verifikation: `npm run build` grün + Live-Check des Tabs.

## Leitplanken

- Nur offizielle API, Token nur Env (VPS + lokal `.env`), nie im Repo/Chat.
- Keine erfundenen Kennzahlen; was die API nicht liefert, zeigt der Tab nicht.
- Wettbewerber-Liste pflegbar in einer Config (`tools/werbe-radar/wettbewerber.json`), Start: fensterversand.com, fenster24.de, Sparfenster.
