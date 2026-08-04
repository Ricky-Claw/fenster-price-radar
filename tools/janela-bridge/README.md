# Janela-Brücke

Schmaler HTTP-Dienst auf dem VPS, der einen fertigen Prompt an die dort angemeldete
**Codex-CLI** weiterreicht und den Antworttext zurückgibt. Damit poliert der Website-Chatbot
seine Antworten über das Abo-Kontingent statt über eine API-Abrechnung — die Chatbot-Funktion
selbst läuft serverlos und hat keine CLI zur Verfügung.

Gegenstelle im Repo: `src/chatbot/codexBridgeClient.js` (erster Anbieter in der Kette,
davor kommt nichts, danach GPT und Claude).

## Sicherheit — bitte vollständig lesen

Der Prompt enthält **Text fremder Website-Besucher**. Die Codex-CLI ist ein Agent mit
Werkzeugen, deshalb ist der Aufruf eng eingezäunt:

- `--sandbox read-only` — der Agent darf nichts schreiben.
- Eigenes **leeres** Wegwerf-Verzeichnis je Anfrage (unter der privaten `/tmp` des Dienstes),
  danach gelöscht. Nie das Repo-Verzeichnis.
- Start über `spawn` **ohne Shell**, Prompt über die Standardeingabe — aus einer
  Kundennachricht kann kein Kommando werden.
- Der Kindprozess erbt **nicht** die Umgebung des Dienstes: weitergegeben werden nur
  `HOME`, `PATH` und `LANG`. Sämtliche Token und Schlüssel bleiben draußen.
- Eigener, unprivilegierter Systemnutzer (`janela`), keine Rechteerweiterung.

**Restrisiko, das bleibt — ehrlich:** `--sandbox read-only` verhindert Schreiben, nicht
**Lesen**. Der Agent kann also systemweit lesbare Dateien öffnen, **einschließlich seiner
eigenen Codex-Anmeldung** unter `~/.codex/auth.json` (die die CLI zum Arbeiten braucht).
Eine geschickte Prompt-Injektion könnte versuchen, solchen Inhalt in die Antwort zu schleusen.
Dagegen zwei Netze in `server.mjs`: (1) ein harter Vorspann, der den Besuchertext als reine
Umformulierungs-Vorlage rahmt und Anweisungen darin entwertet, und (2) ein Ausgabefilter, der
jede Antwort mit token-/schlüssel-artiger Struktur (JWT, `sk-…`, `access_token`, lange
Base64-Blöcke, PEM-Header) **komplett verwirft** — dann bekommt der Kunde lieber gar keine
Politur als ein Leck. Beides sind Hürden, kein Beweis: Ein hinreichend kreativer Angreifer,
der den Token z.B. kodiert ausgeben lässt, könnte den Filter theoretisch umgehen.

Wer dieses Restrisiko **nicht** tragen will, betreibt den Chatbot stattdessen mit
`OPENAI_API_KEY` oder `CLAUDE_CODE_OAUTH_TOKEN` (kein Agent, keine lokale Anmeldedatei im
Zugriff) und lässt diese Brücke weg. Der Chatbot fällt dann automatisch auf diese Anbieter
zurück — die Kette ist Brücke → GPT → Claude.

**Der Dienst darf niemals ohne gesetztes `JANELA_BRIDGE_TOKEN` laufen.** Fehlt es, antwortet
er auf jede Anfrage mit 503 — das ist Absicht und kein Fehler.

## Voraussetzungen

- Node 20 oder neuer auf dem VPS.
- Codex-CLI installiert (`npm install -g @openai/codex`) und **angemeldet** als der
  Systemnutzer, unter dem der Dienst läuft: `sudo -u janela codex login`.
  Die Anmeldung ist interaktiv und muss von einem Menschen im Browser bestätigt werden.

## Installation

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin janela
sudo mkdir -p /opt/janela-bridge
sudo cp server.mjs /opt/janela-bridge/
sudo chown -R janela:janela /opt/janela-bridge

sudo tee /etc/janela-bridge.env >/dev/null <<'ENV'
JANELA_BRIDGE_TOKEN=<langes Zufallsgeheimnis, z.B. openssl rand -hex 32>
JANELA_BRIDGE_MODEL=gpt-5.6-luna
JANELA_BRIDGE_TIMEOUT_MS=20000
ENV
sudo chmod 600 /etc/janela-bridge.env
sudo chown root:root /etc/janela-bridge.env

sudo cp janela-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now janela-bridge
```

Anmeldung der CLI als Dienstnutzer nachholen (interaktiv, einmalig):

```bash
sudo -u janela -H codex login
```

## Reverse Proxy

Der Dienst lauscht nur auf `127.0.0.1:8807`. Nach außen wird er über den vorhandenen
Reverse Proxy unter dem Pfad `/janela` veröffentlicht:

Caddy (dieser VPS), direkt vor `handle /bridge/*` einfügen:

```caddy
handle /janela/* {
    uri strip_prefix /janela
    header Content-Security-Policy "default-src 'none'"
    header X-Robots-Tag "noindex"
    reverse_proxy 127.0.0.1:8807
}
```

Caddys `reverse_proxy` setzt `X-Forwarded-For` automatisch — die Drossel pro Adresse braucht das.
Bei nginx entsprechend `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` ergänzen:

```nginx
location /janela/ {
    proxy_pass http://127.0.0.1:8807/;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 30s;
}
```

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `JANELA_BRIDGE_TOKEN` | ja | Gemeinsames Geheimnis. Ohne diesen Wert antwortet der Dienst nur mit 503. Derselbe Wert gehört in der Hosting-Umgebung des Chatbots hinterlegt. |
| `JANELA_BRIDGE_PORT` | nein | Standard 8807. |
| `JANELA_BRIDGE_MODEL` | nein | Standard `gpt-5.6-luna`. |
| `JANELA_BRIDGE_TIMEOUT_MS` | nein | Standard 20000. Ein Lauf dauert erfahrungsgemäß rund 6 Sekunden. |
| `JANELA_BRIDGE_RATE_PER_IP` | nein | Standard 30 pro Minute. |
| `JANELA_BRIDGE_RATE_GLOBAL` | nein | Standard 120 pro Minute. |

## Prüfen

```bash
curl -s https://<vps-host>/janela/health
```

Erwartet: `{"ok":true}`. Ein vollständiger Durchlauf mit Token:

```bash
curl -s -X POST https://<vps-host>/janela/polish \
  -H "authorization: Bearer $JANELA_BRIDGE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"prompt":"Sage freundlich in einem Satz: Wir haben Fenster in weiss."}'
```

Aus dem Repo heraus prüft `npm run check:llm -- --gegen-produktion`, ob der Chatbot die
Brücke tatsächlich benutzt.

## Protokoll

Je Anfrage eine Zeile mit Zeitstempel, Ergebnis und Dauer — **niemals** Prompt, Antwort oder
Token. Ansehen mit `journalctl -u janela-bridge -f`.

## Wenn keine Antwort kommt

Meldet der Dienst `502` mit „keine Antwort (Ereignisse: …)", hat sich das Ausgabeformat der
CLI geändert. Die aufgelisteten Ereignistypen zeigen, wonach `parseCliOutput` in `server.mjs`
suchen muss. Einen echten Lauf zum Vergleich erzeugt man mit:

```bash
sudo -u janela -H codex exec --json --sandbox read-only --skip-git-repo-check -m gpt-5.6-luna "Sage nur: HALLO"
```
