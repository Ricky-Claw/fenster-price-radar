# Werbe-Radar — Konkurrenz-Anzeigen im Fensterradar (Plan, beschlossen 22.07.2026)

**Beschlüsse (Elvis):** Datenquelle NUR offizielle Meta Ad Library API (kein Scraping) · Wettbewerber: Fensterversand.com, fenster24.de, Sparfenster · nur Fakten, keine KI-Interpretation · eigener Tab neben dem Preisradar · wöchentliche Aktualisierung.

## Was der Tab zeigt (je Wettbewerber)

- Anzahl aktive Meta-Anzeigen (FB+IG) + Veränderung zur Vorwoche
- Neueste Anzeigentexte (Creative-Bodies, gekürzt) mit Laufzeit-Beginn
- Plattformen je Anzeige, EU-Reichweite (sofern von Meta geliefert)
- Klick-Link je Anzeige/Advertiser direkt in die Meta Ad Library
- Wochen-Historie als Snapshot-Reihe (Muster Preisradar: `public/data/werbe-radar.json` + `public/data/history/`)

Kein Spend/CTR — gibt die API für kommerzielle Anzeigen nicht her. Ehrliche Leerstände, wenn ein Wettbewerber nichts schaltet (Stand 22.07.: Fensterversand ~12 Ads, Fensterblick/Neuffer 0).

## Blocker: Meta-Entwicklerzugang (Elvis, einmalig, ~15 Min + 1–3 Tage bzw. länger Wartezeit)

Verifiziert per Websuche 22.07. (vorherige Fassung hatte „App-Typ Sonstiges" falsch geraten — korrigiert):

1. Bereitlegen: Facebook-Login, Ausweis (Perso/Reisepass), evtl. Firmennachweis (Gewerbeanmeldung/Handelsregisterauszug/Rechnung an DFS) für die Unternehmensverifizierung.
2. https://developers.facebook.com öffnen, mit Facebook-Konto einloggen.
3. „Meine Apps" → „App erstellen". App-Typ **Business** (nicht „Sonstiges"). Name z. B. „DFS Werbe-Radar".
4. Im App-Dashboard „Produkt hinzufügen" → **Ads Library API** hinzufügen → `ads_archive`-Endpunkt grundsätzlich verfügbar.
5. Für vollen Zugriff auf normale (nicht-politische) Anzeigen Berechtigung **ads_read** anfragen: „App-Überprüfung" → „Berechtigungen und Funktionen". Meta verlangt: Nutzungszweck-Beschreibung, Daten-Erklärung (nicht weiterverkauft/nicht fürs Targeting), Bildschirm-Video vom Datenfluss (bauen wir zusammen, sobald Elvis an dem Punkt ist).
6. Zusätzlich meist **Identitätsbestätigung** (Ausweis-Upload, führt selbst durch) und/oder **Unternehmensverifizierung** (Firmendokument) — läuft in Metas Oberfläche, nicht durch mich ausfüllbar.
7. Wartezeit: Identität meist 1–3 Werktage, ads_read-Review Tage bis wenige Wochen.
8. Nach Freigabe: Graph API Explorer (developers.facebook.com/tools/explorer) → App wählen → Access Token mit ads_read generieren.
9. Token via Codex-Secrets-Weg übergeben (nie Chat) — Env-Name: `META_ADLIB_TOKEN`.

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
