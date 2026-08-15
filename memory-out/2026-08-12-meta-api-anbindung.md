---
titel: "Meta-API-Anbindung DFS — Token-Kette, Berechtigungen, Stolpersteine (hart erarbeitet 04.–06.08.2026)"
datum: 2026-08-12
agent: fable
bereich: infrastruktur
status: aktiv
tags: [meta, ads, api, dfs, leads, webhook]
quelle: "Repo ~/fenster-price-radar · docs/kampagne-meta-foerderheld.md Abschnitt 6a"
---

## Kontext

Die komplette Meta-Anbindung des Deutschen Fenstershops (Kampagnen-KPIs lesen, Leads abholen, Anzeigen steuern) wurde am 04.–06.08.2026 aufgebaut. Der Weg dorthin kostete mehrere Anläufe, weil Metas Berechtigungsmodell an drei unabhängigen Stellen greift und die Fehlermeldungen jeweils in die falsche Richtung zeigen. Diese Notiz ist die Landkarte — **ohne sie baut man Stunden gegen Wände**.

## Die beteiligten Objekte

| Was | ID | Wo |
| --- | --- | --- |
| App „Schwarzwald Agent Marketing" | `1774686337302059` | developers.facebook.com |
| Business-Portfolio „Schwarzwald Agent" | `1583485143400229` | hält System-User + Werbekonto |
| System-User „Werbemaster" | `61592251276138` | im Portfolio Schwarzwald Agent |
| Business-Portfolio „deutscher.fenstershop" | `2434440623694166` | **besitzt die Facebook-Seite** |
| Facebook-Seite DFS | `1192875973914275` | im DFS-Portfolio |
| Instagram-Konto | `17841441176384958` | mit der Seite verknüpft |
| Werbekonto | `act_1036360495706797` | im Portfolio Schwarzwald Agent |

**Kernproblem der Konstellation:** Seite und Werbekonto liegen in *verschiedenen* Business-Portfolios. Leads landen immer im Leads Center der **Seite**, nie im Werbekonto — wer nur Werbekonto-Zugriff hat, sieht sie nie.

## Die Berechtigungskette (alle vier Ebenen nötig)

1. **Portfolio-Partnerschaft:** Das seiten-besitzende Portfolio muss dem anderen Partner-Zugriff auf die Seite geben, inkl. granularem Schalter **„Leads"**.
2. **Asset-Zuweisung am System-User:** Der System-User „Werbemaster" muss die Seite zusätzlich einzeln zugewiesen bekommen, wieder mit „Leads". Ebene 1 allein reicht nicht.
3. **App-Anwendungsfall:** In der App muss der Anwendungsfall **„Anzeigen-Leads mit Marketing API erfassen und verwalten"** hinzugefügt sein. Fehlt er, taucht `leads_retrieval` im Token-Scope-Dialog **gar nicht erst auf** — der Fehler lautet dann irreführend „Requires pages_manage_metadata".
4. **Token-Scopes:** Beim Generieren explizit anhaken. Aktueller Satz: `ads_management`, `ads_read`, `business_management`, `leads_retrieval`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `public_profile`.

## Stolpersteine, die Zeit gekostet haben

- **Token-Generierung recycelt alte Genehmigungen.** Der Knopf „Token generieren" im System-User-Panel gibt stumm ein Token mit den *alten* Scopes aus, egal welche Anwendungsfälle die App inzwischen hat. Abhilfe: erst **„Tokens widerrufen"**, dann neu generieren — nur dann erscheint der vollständige Scope-Dialog mit Checkboxen.
- **Page Access Token ≠ System-User-Token.** Alles rund um `leadgen_forms` und `/leads` verlangt ein **Page**-Token. Das leitet man zur Laufzeit ab: `GET /{page-id}?fields=access_token` mit dem System-Token. Direkt mit dem System-Token: `(#190) This method must be called with a Page Access Token`.
- **App muss veröffentlicht sein.** Im Entwicklungsmodus liefert Meta grundsätzlich keine Produktionsdaten und keine Webhooks — auch nicht an Admins. Voraussetzung fürs Veröffentlichen war eine hinterlegte Datenschutz-URL (`schwarzwald-agent.de/datenschutz`).
- **App-Geheimcode-Anzeige verlangt Passwort-Reauth.** Kann ein Agent nicht selbst; Elvis muss den Wert einmal abrufen und übergeben.

## Env-Variablen (Namen — Werte liegen ausschließlich in `.env` bzw. Vercel/VPS)

`META_ACCESS_TOKEN` (System-User-Token) · `META_AD_ACCOUNT_ID` · `META_APP_SECRET` (HMAC-Prüfung eingehender Webhooks) · `META_WEBHOOK_VERIFY_TOKEN` (Handshake) · `DFS_META_LEAD_TOKEN` (Bearer zur Schwarzwald-Intake-Route) · `CRON_SECRET` (Poll-Endpoint-Auth) · `META_POLL_LOOKBACK_HOURS` (nicht geheim, Default 6).

## API-Eigenheiten, die man kennen muss

- **Lead-Zählung in Insights doppelt:** Meta liefert pro echtem Lead mehrere parallele Action-Typen (`lead` **und** `onsite_conversion.lead_grouped`). Aufsummieren verdoppelt jeden Lead — **Maximum statt Summe** nehmen. Fiel erst auf, als ein Tagesreport 4 statt 2 Leads meldete.
- **Feldnamen kommen snake_case, Antworten als Option-Keys:** `anzahl_fenster` → `mehr_als_5`. Beides muss vor der Weitergabe in Lesetexte übersetzt werden, sonst steht `mehr_als_5` in der Kundenmail. Alte Formulare haben dieselben Keys **mit** angehängtem Fragezeichen — beide Varianten abfragen.
- **Instant Forms sind nach Veröffentlichung unveränderlich.** Jede Änderung = Duplikat anlegen, in der Anzeige austauschen, neu veröffentlichen. Deshalb vor dem Start einmal richtig prüfen.
- **Test-Leads:** `POST /{form_id}/test_leads` erzeugt genau **einen** pro Formular (danach Fehler 1892058) mit Dummy-Werten `<test lead: dummy data for X>`. Für n Testfälle n verschiedene Formulare nutzen. Löschen schlägt oft fehl, verschwinden aber von selbst.
- **Tagesbudget ist keine harte Grenze.** Meta darf einzelne Tage deutlich überziehen (+75 %) und gleicht über die Kalenderwoche aus. Nur der Wochenschnitt ist bindend — Tagesvergleiche führen in die Irre.
- **Ad-Creatives lassen sich nicht per API klonen.** Das GET-Format weicht vom POST-Format ab (veraltete Crop-Keys, fehlende Karussell-Komponenten, aufgesplittete Optimierungsfelder). Formular-Wechsel in laufenden Anzeigen deshalb über den Ads Manager, nicht über die API.

## Konsequenz

Wer die Anbindung neu aufsetzt oder erweitert: erst die vier Berechtigungsebenen prüfen, dann Token **widerrufen und neu** generieren, dann Page-Token ableiten. Verwandt: [[dfs-meta-lead-pipeline]], [[dfs-meta-ads-foerderheld]].
