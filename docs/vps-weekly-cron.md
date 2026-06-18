# VPS Weekly Cron

This runbook keeps the weekly price update on the Hostinger `nexus-host` VPS (`srv1332950`). The GitHub Action is only a manual fallback.

## One-Time Setup

Clone the repo via SSH into `/opt/fenster-price-radar`:

```bash
sudo mkdir -p /opt
sudo chown "$USER":"$USER" /opt
git clone git@github.com:Ricky-Claw/fenster-price-radar.git /opt/fenster-price-radar
cd /opt/fenster-price-radar
npm ci
```

Create a passphrase-less ed25519 deploy key on the VPS:

```bash
ssh-keygen -t ed25519 -C "fenster-price-radar@nexus-host" -f ~/.ssh/fenster-price-radar-deploy -N ""
cat ~/.ssh/fenster-price-radar-deploy.pub
```

Add the public key to the GitHub repo as a deploy key with write access. Configure SSH to use it for GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/fenster-price-radar-deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
```

Use deploy key auth only. Do not create a PAT, do not put tokens in the repo, and never store secrets in committed files.

## Push Gate

The script commits locally but only pushes when `FPR_PUSH_ENABLED=1`.

Start with the default dry-run gate:

```bash
cd /opt/fenster-price-radar
FPR_PUSH_ENABLED=0 bash scripts/weekly-price-radar-update.sh
```

After a green manual test, flip the cron environment to `FPR_PUSH_ENABLED=1`.

## Crontab

Install this block with `crontab -e`:

```cron
CRON_TZ=Europe/Berlin
FPR_PUSH_ENABLED=0

17 3 * * 1 mkdir -p /var/log/fenster-price-radar && flock -n /tmp/fpr-weekly.lock bash -lc 'cd /opt/fenster-price-radar && bash scripts/weekly-price-radar-update.sh' >> "/var/log/fenster-price-radar/weekly-$(date +\%F).log" 2>&1
```

`CRON_TZ=Europe/Berlin` keeps the Monday 03:17 run aligned with Berlin time across DST changes. `flock` prevents overlapping runs.

## Logs

Read the latest log with:

```bash
ls -lt /var/log/fenster-price-radar/
tail -n 200 /var/log/fenster-price-radar/weekly-$(date +%F).log
```

## Recovery

If a failed push leaves local `main` ahead, the next `git pull --ff-only origin main` can stop before a new run. Inspect first:

```bash
cd /opt/fenster-price-radar
git status
git log --oneline --decorate --max-count=5
git log --oneline origin/main..main
```

If the ahead commit is the intended weekly price snapshot and GitHub is still behind, push it manually:

```bash
FPR_PUSH_ENABLED=1 git push origin main
```

If GitHub already has a newer snapshot, preserve any needed log output, then reset only after confirming the local ahead commit should be discarded:

```bash
git fetch origin main
git branch backup/local-main-before-recovery-$(date +%Y%m%d-%H%M%S)
git reset --hard origin/main
```
