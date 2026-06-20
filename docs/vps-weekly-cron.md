# VPS Weekly Cron

This runbook keeps the weekly price update on the Hostinger `nexus-host` VPS (`srv1332950`). The GitHub Action is only a manual fallback.

## One-Time Setup

Run the one-time setup from an account with `sudo`. If the dedicated user already exists, skip the `useradd` command.

```bash
id fensterradar >/dev/null 2>&1 || sudo useradd -r -m -d /home/fensterradar -s /usr/sbin/nologin fensterradar
# Debian alternative:
# id fensterradar >/dev/null 2>&1 || sudo adduser --system --group --home /home/fensterradar --shell /usr/sbin/nologin fensterradar
sudo mkdir -p /opt/fenster-price-radar /var/log/fenster-price-radar
```

Keep the deploy key under the `fensterradar` home. For a fresh key, create it as the service user:

```bash
sudo -u fensterradar mkdir -p /home/fensterradar/.ssh && sudo chmod 700 /home/fensterradar/.ssh
sudo -u fensterradar ssh-keygen -t ed25519 -C "fenster-price-radar@nexus-host" -f /home/fensterradar/.ssh/fenster-price-radar-deploy -N ""
sudo chown fensterradar:fensterradar /home/fensterradar/.ssh/fenster-price-radar-deploy
sudo chmod 600 /home/fensterradar/.ssh/fenster-price-radar-deploy
```

If this VPS already has the deploy key under `/root/.ssh`, move the private key and public key instead of generating a new key. The GitHub deploy key public half is unchanged:

```bash
sudo -u fensterradar mkdir -p /home/fensterradar/.ssh && sudo chmod 700 /home/fensterradar/.ssh
sudo mv /root/.ssh/fenster-price-radar-deploy /home/fensterradar/.ssh/
sudo mv /root/.ssh/fenster-price-radar-deploy.pub /home/fensterradar/.ssh/
sudo chown fensterradar:fensterradar /home/fensterradar/.ssh/fenster-price-radar-deploy /home/fensterradar/.ssh/fenster-price-radar-deploy.pub
sudo chmod 600 /home/fensterradar/.ssh/fenster-price-radar-deploy
```

Configure SSH to use the deploy key for GitHub and pre-populate `known_hosts`:

```bash
sudo -u fensterradar tee /home/fensterradar/.ssh/config >/dev/null <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /home/fensterradar/.ssh/fenster-price-radar-deploy
  IdentitiesOnly yes
EOF
sudo chown fensterradar:fensterradar /home/fensterradar/.ssh/config
sudo chmod 600 /home/fensterradar/.ssh/config
sudo -u fensterradar bash -c 'ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts'
sudo chmod 600 /home/fensterradar/.ssh/known_hosts
```

Print the public key:

```bash
sudo cat /home/fensterradar/.ssh/fenster-price-radar-deploy.pub
```

Add the public key to the GitHub repo as a deploy key with write access before continuing.

Verify SSH access after the deploy key is registered:

```bash
sudo -u fensterradar ssh -T git@github.com
```

Clone the repo into `/opt/fenster-price-radar` after the deploy key is registered. If an existing root-cron checkout already exists, move it to `/opt/fenster-price-radar` instead of cloning a second copy.

```bash
sudo chown fensterradar:fensterradar /opt/fenster-price-radar
sudo -u fensterradar git clone git@github.com:Ricky-Claw/fenster-price-radar.git /opt/fenster-price-radar
```

For an existing checkout:

```bash
sudo rmdir /opt/fenster-price-radar
sudo mv /path/to/existing/fenster-price-radar /opt/fenster-price-radar
```

If the existing checkout already lives at `/opt/fenster-price-radar`, skip the move and only fix ownership in the next step.

Then set ownership, Git identity, and dependencies:

```bash
sudo chown -R fensterradar:fensterradar /opt/fenster-price-radar /var/log/fenster-price-radar
cd /opt/fenster-price-radar
sudo -u fensterradar git config user.name "Ricky-Claw"
sudo -u fensterradar git config user.email "ricky@lanistasoundcraft.de"
sudo -u fensterradar npm ci
```

Use deploy key auth only. Do not create a PAT, do not put tokens in the repo, and never store secrets in committed files.

## Push Gate

The script commits locally but only pushes when `FPR_PUSH_ENABLED=1`.

Run the manual dry-run test as the new user before enabling push:

```bash
sudo -u fensterradar bash -lc 'cd /opt/fenster-price-radar && FPR_PUSH_ENABLED=0 ./scripts/weekly-price-radar-update.sh'
```

After a green manual test, the live weekly cron must run with `FPR_PUSH_ENABLED=1` so it commits, pushes, and deploys the fresh snapshot. The `FPR_PUSH_ENABLED=0` value above is only for the initial dry-run. The button-triggered service always runs with `FPR_PUSH_ENABLED=1`, so an on-demand click commits and pushes a fresh snapshot.

## Crontab

Install this block in the `fensterradar` user crontab, not root:

```bash
sudo crontab -u fensterradar -e
```

```cron
CRON_TZ=Europe/Berlin
FPR_PUSH_ENABLED=1

17 3 * * 1 flock -n /tmp/fpr-weekly.lock bash -lc 'cd /opt/fenster-price-radar && ./scripts/weekly-price-radar-update.sh' >> "/var/log/fenster-price-radar/weekly-$(date +\%F).log" 2>&1
```

`CRON_TZ=Europe/Berlin` keeps the Monday 03:17 run aligned with Berlin time across DST changes. `flock` prevents overlapping runs.

Remove the old root cron job after installing the user cron:

```bash
sudo crontab -u root -l
sudo crontab -u root -e
```

Delete the old `fenster-price-radar` line from root's crontab. If root's crontab only contained this job, remove the whole root crontab instead:

```bash
sudo crontab -u root -r
```

Verify root no longer lists the job:

```bash
sudo crontab -u root -l
```

Warning: if the root cron is left in place, it will grab the shared `/tmp/fpr-weekly.lock` and then fail git auth because the deploy key moved to `fensterradar`, causing the new cron to skip that week.

## Verify

Check the installed user crontab and confirm root no longer has the old job:

```bash
sudo crontab -u fensterradar -l
sudo crontab -u root -l
```

If `/etc/fenster-radar/trigger.env` is installed for the on-demand button, keep it readable by the service user but not world-readable:

```bash
chown root:fensterradar /etc/fenster-radar/trigger.env
chmod 640 /etc/fenster-radar/trigger.env
```

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
