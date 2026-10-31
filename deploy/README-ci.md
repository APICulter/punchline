# CI/CD: GitHub Actions → VPS

```
push to main ──► CI (.github/workflows/ci.yml)
                  ├─ checks: node --check, CSS up to date, shellcheck, npm audit (high), no secrets
                  └─ smoke:  server + MongoDB 8, /healthz, create game, 2 players join, start, question
                     │ success, push event on main
                     ▼
                 Deploy (.github/workflows/deploy.yml), environment "production"
                  └─ ssh deploy@VPS <sha>
                       └─ forced command: sudo /usr/local/sbin/punchline-deploy <sha>
                            └─ /usr/local/lib/punchline/deploy.sh <sha>
                                 fetch ─ sha on origin/main? ─ checkout ─ npm ci (if lockfile changed)
                                 ─ systemctl restart punchline ─ /healthz 200 within 30 s?
                                    no → previous commit checked out and restarted, exit 1 (CI run red)
```

Pull requests run CI only. A failed CI never deploys. Two pushes in a row deploy one after the
other (concurrency group), never in parallel; the VPS also takes a lock (`flock`).

## One-time setup

### 1. Deploy key (on your computer)

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy@punchline" -f punchline_deploy
# punchline_deploy      private key -> GitHub secret VPS_SSH_KEY
# punchline_deploy.pub  public key  -> setup-vps.sh --deploy-key
```

This key can do one thing only on the VPS: deploy a commit that is already on `main`. It cannot
open a shell, forward ports, or run any other command.

### 2. DNS

Create the `A` (and `AAAA` if the VPS has IPv6) record of the domain → the VPS address. Check with
`dig +short punchline.example.com`. Without it the script still installs everything, HTTP only,
and tells you to run it again for the certificate.

### 3. The VPS (Ubuntu 24.04 LTS or Debian 12, as root)

```bash
curl -fsSLO https://raw.githubusercontent.com/APICulter/punchline/main/deploy/setup-vps.sh
sudo bash setup-vps.sh \
  --domain punchline.example.com \
  --email you@example.com \
  --deploy-key "$(cat punchline_deploy.pub)" \
  --admin-user yourname          # only if you log in as root today (see below)
# add --dry-run first to see every command without changing anything
```

It can be run again at any time (same options): it only changes what is missing or different.
**Re-run it after changing `deploy/deploy.sh`, `deploy/deploy-wrapper.sh`, the systemd units or
the nginx site**: the deploy scripts that sudo runs are root-owned copies outside the checkout
(`/usr/local/sbin/punchline-deploy`, `/usr/local/lib/punchline/deploy.sh`), so a commit cannot
change what runs as root. `deploy.sh` prints a NOTE when the repository has a newer version.

SSH hardening (no root login, no passwords) is only applied when a sudo user can already log in
with a key; otherwise the script warns and skips it so you cannot lock yourself out. If you log in
as root, `--admin-user yourname` creates that user with root's keys and passwordless sudo. Keep
your session open and test `ssh yourname@host` + `sudo -v` in a new terminal.

At the end the script prints the values for GitHub, including the `VPS_KNOWN_HOSTS` lines read
from the server's own host keys.

Then create the admin panel password (see the main README, "Admin panel"):

```bash
cd /srv/punchline && sudo -u punchline npm run --silent admin:password
sudo nano /etc/punchline/punchline.env      # ADMIN_USER='admin' and ADMIN_PASSWORD_HASH='scrypt$...'
sudo systemctl restart punchline
```

### 4. GitHub

**Settings → Environments → New environment → `production`**

- *Deployment branches and tags*: "Selected branches" → `main`.
- *Required reviewers* (optional): add yourself to approve each deploy by hand (Actions shows
  "Review deployments"). Without it, every green push to `main` deploys automatically.
- *Environment secrets* (secrets of the environment, not of the repository, so that only an
  approved deploy job can read them):

| Secret | Value |
| --- | --- |
| `VPS_HOST` | the domain or IP address, e.g. `punchline.example.com` |
| `VPS_SSH_KEY` | the whole content of `punchline_deploy` (private key, with the BEGIN/END lines) |
| `VPS_KNOWN_HOSTS` | the host key lines printed by setup-vps.sh (see below) |
| `VPS_PORT` | optional, only if SSH does not listen on 22 |

- *Environment variable* (optional): `PUBLIC_URL` = `https://punchline.example.com`: the
  workflow then checks `PUBLIC_URL/healthz` from the outside after the deploy, and the environment
  page links to the site.

Then delete the local private key (`rm punchline_deploy`); to replace it, generate a new pair, run
setup-vps.sh with the new `--deploy-key` and update `VPS_SSH_KEY` (the old key is kept in
`/home/deploy/.ssh/authorized_keys` until you delete its line).

**`VPS_KNOWN_HOSTS`** pins the server's identity (no `StrictHostKeyChecking=no`). Best: copy the
lines printed at the end of setup-vps.sh. Or, from your computer:

```bash
ssh-keyscan -t ed25519 punchline.example.com            # port 22
ssh-keyscan -t ed25519 -p 2222 punchline.example.com    # other port: the line starts with [host]:2222
```

and compare the fingerprint with the one shown on the server
(`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) before trusting it. The host name in the line
must be exactly `VPS_HOST` (`[VPS_HOST]:PORT` for another port).

**Recommended**: *Settings → Branches → add a rule for `main`* → require the status checks
"Checks (syntax, CSS, shell, audit, secrets)" and "Smoke test (server + MongoDB 8)" before merging.

## Rolling back

The deploy already rolls back by itself when the new version does not answer `/healthz` within
30 s. To go back to an older version by hand:

- **From GitHub**: *Actions → Deploy → Run workflow* (branch `main`), field "Commit of main to
  deploy" = the full SHA of the good commit (`git log --format='%H %s' origin/main`).
- **On the VPS**:

  ```bash
  sudo /usr/local/lib/punchline/deploy.sh --status      # deployed / previous commit, health, history
  sudo /usr/local/lib/punchline/deploy.sh --rollback    # back to the previous deployed commit
  sudo punchline-deploy <full sha of main>              # any older commit of main
  tail -n 50 /var/log/punchline-deploy.log
  ```

A manual rollback lasts until the next push to `main` deploys again: fix or `git revert` the bad
commit on `main` so that the next deploy is good. Only commits that are on `origin/main` can be
deployed. Database changes are not rolled back (backups: main README, "Backups").

## Good to know

- **systemd, not PM2, on the server**: systemd is already there, restarts the game after a crash
  or a reboot, starts it after MongoDB, keeps the logs in the journal, sandboxes the process, and
  a deploy needs one root action (`systemctl restart punchline`). PM2 would add a global npm
  package and a daemon per user. `deploy/ecosystem.config.js` stays for other setups.
- **Games survive a deploy**: on `SIGTERM` the server saves the games in progress and restores
  them at startup; screens and phones reconnect by themselves.
- **CSS**: `public/css/style.css` is committed and built by nobody on the server (Tailwind is a
  devDependency). CI fails when it is out of date: run `npm run build:css` and commit it.
- **`npm ci`** runs on the server only when `package-lock.json` (or the Node.js version) changed,
  as the `punchline` user, without dev dependencies.
- **Settings**: secrets and environment in `/etc/punchline/punchline.env` (MongoDB URI with its
  generated password, PUBLIC_URL, ADMIN_*, ANTHROPIC_*); game settings (timers, players per room)
  in `/etc/punchline/config.properties`, copied over `config.properties` after every checkout:
  do not edit files inside `/srv/punchline` (a deploy refuses to run over hand-edited tracked
  files). The MongoDB admin password is in `/etc/punchline/mongodb-admin.env` (root only).
- **Who can do what**: the `deploy` user has no password, its `authorized_keys` (owned by root)
  forces `sudo -n /usr/local/sbin/punchline-deploy "$SSH_ORIGINAL_COMMAND"` with `restrict` (no
  shell, pty, forwarding); sudoers allows that file only, with one 40-hex argument; the wrapper
  checks the SHA again and runs `deploy.sh` with an empty environment; `deploy.sh` runs git and npm
  as `punchline`, and only `systemctl restart` as root.
- **Private repository**: not handled. The VPS clones and fetches over HTTPS without credentials,
  which works because the repository is public. A private repository would need a read-only
  GitHub deploy key for the `punchline` user plus `--repo git@github.com:...`.
- **Smoke test by hand**: `SMOKE_URL=https://punchline.example.com npm run test:smoke` (it creates
  a game, plays until the first question, then ends it).
