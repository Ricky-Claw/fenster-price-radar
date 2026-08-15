---
titel: "DFS-Lead-Pipeline: Meta-Webhook liefert nicht — VPS-Poller ist die Lösung (Stand 12.08.2026)"
datum: 2026-08-12
agent: fable
bereich: infrastruktur
status: aktiv
tags: [meta, leads, cron, crm, dfs, webhook]
quelle: "Repo ~/fenster-price-radar · tools/meta-leadgen-poll/poll.mjs"
---

## Kontext

Zwischen dem 02. und 06.08.2026 blieben mehrfach echte Kunden-Leads liegen: sie standen im Meta Leads Center, aber weder CRM-Eintrag noch Benachrichtigungsmail wurden ausgelöst. Verdächtigt wurde zuerst die eigene Konfiguration — falsch.

## Kern

**Meta sendet Leadgen-Webhooks bei „Standard Access" für `leads_retrieval` ausschließlich für Leads von App-Rollen-Inhabern** (Testtool, Admins). Für echte Endkunden feuert der Webhook nie. Das ist Meta-Policy, kein Defekt: Subscriptions (App-Ebene `object=page, field=leadgen` und Seiten-Ebene `subscribed_apps`) waren durchgehend korrekt aktiv, manuell signierte Replays liefen sofort durch. Echtzeit-Webhooks gäbe es erst mit **Advanced Access** (App-Review, Dauer unbestimmt).

**Elvis-Entscheid 06.08.2026: kein App-Review, der Poller bleibt die Lösung.** Für das reale Lead-Volumen ist der Unterschied zwischen „sofort" und „≤10 Minuten" bedeutungslos.

## Die Pipeline

VPS-Cron auf `nexus-host`, alle 10 Minuten:
`/opt/fenster-price-radar` → `node tools/meta-leadgen-poll/poll.mjs`
(Env `/root/.dfs-meta-poll.env`, Log `/var/log/meta-leadgen-poll.log`)
→ gemeinsame Logik `src/leads/metaLeadgen.js`
→ POST an die Schwarzwald-Route `/api/leads/dfs-meta`
→ dort Dedupe über `meta_lead_id`, CRM-Kontakt (`project: kunde`, `stage: neu`), Mail an DFS **plus BCC an Elvis**, Web-Push an DFS- und Admin-Kanal.

Der Poller läuft als **reines Node-Skript ohne KI** — Kontingente oder Wochenlimits der Agenten berühren ihn nicht. Ein zweiter Weg existiert als Vercel-Endpoint `api/meta-leadgen-poll.js` (Auth per `CRON_SECRET`), war am 05.08. wegen des Vercel-Free-Tageslimits (100 Deploys/24 h) nicht ausrollbar.

Alarm-Semantik: Teilfehler landen in `errors[]` bei Exit 0; kommt **kein einziger** Forward durch oder scheitert Graph-Auth/-Listing komplett, endet der Lauf mit Exit 1 — damit schlägt der Cron an, statt still Nullen zu liefern.

## Konsequenz

Bei „Lead kam nicht an" **nie** die Webhook-Konfiguration verdächtigen. Reihenfolge: (1) VPS-Log ansehen, (2) `npm run leads:poll -- --hours=24` lokal laufen lassen, (3) im Leads Center gegenprüfen, ob überhaupt ein Lead existiert. In der Praxis war die Antwort zweimal schlicht: es gab keine neuen Leads.

Verwandt: [[meta-api-anbindung]], [[dfs-meta-ads-foerderheld]].
