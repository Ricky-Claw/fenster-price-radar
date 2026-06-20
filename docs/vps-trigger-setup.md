# VPS Trigger Setup

Install the on-demand trigger service on the VPS. No secrets are committed to the repo.

## Install files

Create the dedicated service user first:

```sh
sudo useradd -r -m -d /home/fensterradar -s /usr/sbin/nologin fensterradar
# Debian alternative:
# sudo adduser --system --group --home /home/fensterradar --shell /usr/sbin/nologin fensterradar
```

The repo, trigger service files, logs, and deploy key must belong to this user. If the deploy key already exists under `/root/.ssh`, move the private key, public key, and the matching `Host github.com` SSH config block into `/home/fensterradar/.ssh`; the public deploy key registered in GitHub stays the same.

```sh
sudo install -d -m 0700 -o fensterradar -g fensterradar /home/fensterradar/.ssh
sudo mv /root/.ssh/fenster-price-radar-deploy /home/fensterradar/.ssh/
sudo mv /root/.ssh/fenster-price-radar-deploy.pub /home/fensterradar/.ssh/
sudo tee /home/fensterradar/.ssh/config >/dev/null <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /home/fensterradar/.ssh/fenster-price-radar-deploy
  IdentitiesOnly yes
EOF
sudo chown -R fensterradar:fensterradar /home/fensterradar/.ssh
sudo chmod 700 /home/fensterradar/.ssh
sudo chmod 600 /home/fensterradar/.ssh/fenster-price-radar-deploy /home/fensterradar/.ssh/config
```

```sh
sudo mkdir -p /opt/fenster-radar-trigger && sudo cp ops/vps/trigger-server.js /opt/fenster-radar-trigger/ && sudo chown -R fensterradar:fensterradar /opt/fenster-radar-trigger

sudo install -d -m 0750 -o root -g fensterradar /etc/fenster-radar
TOKEN=$(openssl rand -hex 32)
printf 'FPR_TRIGGER_TOKEN=%s\n' "$TOKEN" | sudo tee /etc/fenster-radar/trigger.env >/dev/null
sudo chown root:fensterradar /etc/fenster-radar/trigger.env && sudo chmod 640 /etc/fenster-radar/trigger.env

sudo mkdir -p /var/log/fenster-price-radar
sudo chown -R fensterradar:fensterradar /opt/fenster-price-radar /var/log/fenster-price-radar

sudo install -m 0644 ops/vps/fpr-trigger.service /etc/systemd/system/fpr-trigger.service
sudo systemctl daemon-reload
sudo systemctl enable --now fpr-trigger.service
```

The same `TOKEN` value must be set as `FPR_TRIGGER_TOKEN` in the Vercel project environment so the Vercel `/api/trigger-update` function can call this service.

Note: the trigger service runs the copied file at `/opt/fenster-radar-trigger/trigger-server.js`, not the repo file directly. Updating `ops/vps/trigger-server.js` requires re-copying it to `/opt/fenster-radar-trigger/` and running `systemctl restart fpr-trigger`; a plain `git pull` does not update the running button service.

## Caddy

Add this site block for `srv1332950.hstgr.cloud`. Do not remove the existing `stats.schwarzwald-agent.de` block.

```caddy
srv1332950.hstgr.cloud {
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "no-referrer"
		Permissions-Policy "geolocation=(), microphone=(), camera=()"
	}

	header /fpr/* {
		Content-Security-Policy "default-src 'none'"
		X-Robots-Tag "noindex"
	}

	reverse_proxy /fpr/* 127.0.0.1:8790
}
```

Reload Caddy:

```sh
sudo caddy reload --config /etc/caddy/Caddyfile
```

The `/fpr/*` matcher is intentionally proxied without stripping the `/fpr` prefix because the Node service handles `/fpr/trigger` and `/fpr/status` directly.

Button-triggered runs execute as `fensterradar` with `FPR_PUSH_ENABLED=1`, so an on-demand click commits and pushes a fresh snapshot, which triggers a deploy. The weekly cron has its own `FPR_PUSH_ENABLED` value in the `fensterradar` user crontab.

## Verify

```sh
curl -s -H "Authorization: Bearer $TOKEN" https://srv1332950.hstgr.cloud/fpr/status
```

The service shares `/tmp/fpr-weekly.lock` with the weekly cron through `flock`, so the button-triggered run and the Monday cron can never run simultaneously.
