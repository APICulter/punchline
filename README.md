# Punchline

## Purpose

This game is called "Punchline". It is a copy of the game "Use Your Words".

## How to play

Open the site on a shared screen and create a room. Each participant opens the game URL on a phone, enters the generated code to join the room and picks a name tag. Once the settings are made and the participants are ready, the game starts and goes through a number of rounds that go like this:

- A question, image or video appears on the screen with a theme of some sort.
- Everyone has a limited time to give an answer on their phone (60 seconds by default, set by the host in the lobby).
- Once everyone has answered, the answers are displayed anonymously on the phones.
- Everyone votes for an answer (except their own).
- Each player gets one point per vote received.
- Then comes the next round, until the end of the game.
- The one with the highest number of points wins.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 22.22.2 or later (or 24.15+), with npm. `isomorphic-dompurify` 4.x requires it.
- [MongoDB](https://www.mongodb.com/try/download/community), running locally on `mongodb://127.0.0.1:27017` by default.

### Steps

1. Clone the repository and install the dependencies:

   ```bash
   git clone https://github.com/APICulter/punchline.git
   cd punchline
   npm install
   ```

2. Create your configuration file from the template, then edit it:

   ```bash
   cp config.properties.example config.properties
   ```

   The main keys are:

   | Key | Purpose |
   | --- | --- |
   | `databaseUrl` | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/punchline` |
   | `applicationPort` | HTTP port the server listens on (default `3000`, overridden by the `PORT` environment variable) |
   | `punchlineURL` | Address shown to players in the lobby. Leave empty on a local network: the server shows the address the host opened, with `localhost` replaced by the machine's network IP. In production set it here or with the `PUBLIC_URL` environment variable (which wins), e.g. `https://punchline.example.com` |
   | `maxNumberOfPlayers` | Maximum number of players per room |
   | `premiumCode` | Code that unlocks premium (explicit) questions, 15 characters max |
   | `questionCountDown` | Default time to write an answer, in seconds (default `60`, min `30`, max `150`). The host can change it in the lobby for each game |
   | `revealTime` | Default time each answer stays on the big screen during the reveals, in seconds (default `10`, min `10`, max `30`). The host can change it in the lobby for each game |
   | `beforeQuestionCountDown`, `voteCountDown` | Other round timers, in seconds |
   | `botName` | Name players cannot take (reserved for the bot) |

   Messages shown to players are not configured here anymore: see [Language](#language).

   `config.properties` is ignored by git: do not commit real codes or passwords.

3. Load the question bank into MongoDB: `npm run db:seed` (see [Questions](#questions)). The server also does it by itself at startup when a language has fewer than 50 questions.

4. Build the CSS (Tailwind through PostCSS):

   ```bash
   npm run build:css
   ```

   While working on the front end, use `npm run dev` instead: it rebuilds `public/css/style.css` on every change.

5. Start the server:

   ```bash
   npm start
   ```

6. Open <http://localhost:3000> (or the port set in `applicationPort`). Players join from their phones using the address shown in the lobby (the machine's local network address, e.g. `http://192.168.1.10:3000`, unless `PUBLIC_URL` / `punchlineURL` is set).

### Production

```bash
PUBLIC_URL=https://punchline.example.com PORT=8080 npm start
```

Behind a reverse proxy, `PUBLIC_URL` is the address players type; without it the server falls back to the `Host` header (and to `X-Forwarded-Host` / `X-Forwarded-Proto` only when `TRUST_PROXY` is set, see below).

Environment variables (they win over `config.properties`):

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default: `applicationPort`, then `3000`) |
| `HOST` | Address to listen on, e.g. `127.0.0.1` behind nginx so that the Node port is not reachable from outside (default: all interfaces) |
| `PUBLIC_URL` | Address shown to players, e.g. `https://punchline.example.com` |
| `MONGODB_URI` | MongoDB connection string (default: `databaseUrl`) |
| `TRUST_PROXY` | Set it **only** behind a reverse proxy, so that `X-Forwarded-*` headers are trusted: `loopback` for nginx on the same machine (also accepts a number of hops, a list of addresses / subnets, or `true`). Not set: these headers are ignored |
| `NODE_ENV` | `production` on a server |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_*` | Optional AI question generation, see [Generating questions with AI](#generating-questions-with-ai) |

For a real server, see [Deploying on a VPS](#deploying-on-a-vps).

In VS Code, the "Launch Punchline" configuration in `.vscode/launch.json` starts `app.js` under the debugger.

## Deploying on a VPS

The `deploy/` folder has everything needed to run Punchline on a Linux VPS (Debian / Ubuntu here) behind nginx with HTTPS:

| File | Purpose |
| --- | --- |
| `deploy/ecosystem.config.js` | PM2: one process, auto-restart, memory limit, logs |
| `deploy/punchline.service` | systemd unit, an alternative to PM2 (use one or the other) |
| `deploy/punchline.env.example` | Environment file for the systemd unit |
| `deploy/nginx-punchline.conf` | nginx site: HTTP → HTTPS, Let's Encrypt certificates, WebSocket proxy to `127.0.0.1:3000` |

### How the server stays up

- **A bug in one game only stops that game.** Every socket handler and server timer is guarded: an exception is logged (one JSON line with the time, the game PIN, the event, the error and its stack) and that game alone is ended; its host and players go back to the home page with "Oops, this game hit a problem and had to stop". The other games carry on.
- **A crash of the process is restarted by the supervisor** (PM2 or systemd). On an unexpected exception the server saves the games, logs a `fatal` line and exits with code 1 rather than going on in an unknown state.
- **Games survive a restart.** Games are copied to the MongoDB collection `games` (at most once per second after a change, and when the server stops). On startup, the games that are not finished and were updated in the last 6 hours are restored. Phones and the big screen reconnect by themselves and take their place back (same PIN, same names, scores kept). A round that was interrupted starts over if the answers were still open; otherwise it counts as played (votes already given are kept) and the game goes on with the next question. Saved games are deleted by MongoDB after 7 days.
- **Graceful stop.** On `SIGTERM` (systemd) or `SIGINT` (PM2, Ctrl+C), the server stops accepting connections, saves the games, closes socket.io, HTTP and MongoDB, and exits within 5 seconds. Updating the server therefore does not end the games in progress: they pause for a few seconds.
- **Health check.** `GET /healthz` returns `{"status":"ok","uptime":…,"games":…,"mongo":"connected"}` with HTTP 200, or HTTP 503 when MongoDB is unreachable (or while the server is stopping). Use it with an uptime monitor.

### 1. Install Node.js and MongoDB

```bash
# Node.js 22 LTS (or 24), from NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

# MongoDB Community: follow https://www.mongodb.com/docs/manual/administration/install-on-linux/
# then:
sudo systemctl enable --now mongod
```

MongoDB only listens on `127.0.0.1` by default: keep it that way (or enable authentication and use a `MONGODB_URI` with a user and password).

### 2. Get the code and configure it

```bash
sudo adduser --system --group --home /srv/punchline punchline
sudo -u punchline git clone https://github.com/APICulter/punchline.git /srv/punchline
cd /srv/punchline
sudo -u punchline npm ci --omit=dev
sudo -u punchline cp config.properties.example config.properties   # then edit it (premium code, timers…)
```

`public/css/style.css` is committed, so the server does not need the CSS build tools. The question bank is loaded at the first start (or run `sudo -u punchline npm run db:seed`, see [Questions](#questions)).

### 3a. Run it with PM2

```bash
sudo npm install -g pm2
# edit deploy/ecosystem.config.js: PUBLIC_URL (and MONGODB_URI if needed)
sudo -u punchline pm2 start deploy/ecosystem.config.js
sudo -u punchline pm2 save
sudo pm2 startup systemd -u punchline --hp /srv/punchline   # start PM2 at boot
sudo -u punchline pm2 install pm2-logrotate                 # rotate the log files
```

### 3b. Or run it with systemd

```bash
sudo cp deploy/punchline.service /etc/systemd/system/punchline.service
sudo mkdir -p /etc/punchline
sudo cp deploy/punchline.env.example /etc/punchline/punchline.env && sudo chmod 600 /etc/punchline/punchline.env
# edit both files: User, WorkingDirectory, ExecStart (path of `command -v node`), PUBLIC_URL…
sudo systemctl daemon-reload
sudo systemctl enable --now punchline
curl -s http://127.0.0.1:3000/healthz
```

### 4. nginx and HTTPS (certbot)

Point the domain's DNS (A / AAAA records) to the VPS, then:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
# certificate first (nginx still has its default site at this point)
sudo certbot certonly --nginx -d punchline.example.com
# then the Punchline site (replace punchline.example.com in it)
sudo cp deploy/nginx-punchline.conf /etc/nginx/sites-available/punchline
sudo ln -s /etc/nginx/sites-available/punchline /etc/nginx/sites-enabled/punchline
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Certificates renew automatically (certbot's systemd timer); add `--deploy-hook "systemctl reload nginx"` to the `certbot` command, or check with `sudo certbot renew --dry-run`. Open ports 80 and 443 only (e.g. `sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable`): port 3000 must not be reachable from outside. The server must run with `TRUST_PROXY=loopback` (already set in both PM2 and systemd files) so that it trusts the `X-Forwarded-*` headers sent by nginx.

### Updating

```bash
cd /srv/punchline
sudo -u punchline git pull
sudo -u punchline npm ci --omit=dev
sudo -u punchline pm2 reload punchline        # or: sudo systemctl restart punchline
```

Games in progress are saved before the restart and resumed after it (the screens show "We're back!").

### Backups

The questions (and the admin data) are in MongoDB. A daily dump, kept 14 days (`sudo crontab -e`):

```bash
30 4 * * * mongodump --uri="mongodb://127.0.0.1:27017/punchline" --gzip --archive=/var/backups/punchline/punchline-$(date +\%F).gz && find /var/backups/punchline -name '*.gz' -mtime +14 -delete
```

Create the folder first (`sudo mkdir -p /var/backups/punchline`) and copy the dumps off the VPS from time to time. Restore with `mongorestore --gzip --archive=/var/backups/punchline/punchline-2026-01-31.gz --drop`. The `games` collection only holds games in progress: it does not need to be restored.

### Logs

| What | Where |
| --- | --- |
| Punchline (PM2) | `pm2 logs punchline`, files in `/srv/punchline/logs/` |
| Punchline (systemd) | `journalctl -u punchline -f` |
| nginx | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| MongoDB | `/var/log/mongodb/mongod.log` |

The server writes one JSON object per line (`time`, `level`, `msg`, plus `pin`, `event`, `error`, `stack` for errors), e.g. `pm2 logs punchline --raw | grep '"level":"error"'` or `journalctl -u punchline -o cat | jq 'select(.level=="error")'`.

### Can one process handle it?

Yes, for a party game. A game is one big screen and a few phones that send a handful of small messages per round; between rounds nothing happens. A single Node.js process with socket.io keeps thousands of WebSocket connections open: in a quick test, 500 games with 4 connections each (2,000 WebSockets) added about 35 MB of memory (~70 KB per game, connections included), and 2,000 requests sent at the same moment were all answered within 140 ms. A small VPS (1 vCPU, 1 GB of RAM) therefore runs several hundred games at the same time. Watch the `games` count of `/healthz` and the memory of the process (`pm2 monit`) to see where you are.

**Do not run several instances as is** (PM2 cluster mode, `instances` > 1, several systemd services behind a load balancer): games live in the memory of one process, so a phone connected to another instance would not find its game, and the instances would overwrite each other's saved games. If one process is ever not enough, the usual path is: the [socket.io Redis adapter](https://socket.io/docs/v4/redis-adapter/) so that events reach every instance, sticky sessions in nginx (e.g. `ip_hash` or a cookie) so that a client stays on the same instance, and the games moved out of the process memory (Redis or MongoDB) or each game kept on one instance chosen by its PIN. This is not built today.

## Language

The interface is available in English and French. Each device (the big screen and every phone) has its own language: the "FR" / "EN" button in the top bar switches it instantly, and the choice is remembered in the browser (`localStorage`, key `punchline.lang`). The first time, the browser language is used (French for `fr*`, English otherwise).

- All texts live in `public/js/i18n.js` (one dictionary per language). Static HTML is marked with `data-i18n="key"` (text), `data-i18n-placeholder`, `data-i18n-aria-label`, `data-i18n-title` or `data-i18n-empty`; scripts use `t(key, params)`, or `i18nText(element, key, params)` so that the text follows a language change.
- The server sends message keys (e.g. `error.roomFull`) on the same events as before; the browser translates them. A message that is not a known key is displayed as is.
- To add a language: add a dictionary next to `en` and `fr` in `i18n.js` (same keys; plural entries are `{ one, other }` objects), then adapt the switch button (it currently toggles between the two languages).
- Questions are not translated: each question has a language (`fr` or `en`) and a game only uses the questions of the **host's language** (the language of the big screen when "Start" is pressed). See [Questions](#questions).

## Questions

### The bank

The game reads its questions from the MongoDB collection `questions`. The project ships an original bank of about 500 questions per language in `db/questions/fr.csv` and `db/questions/en.csv`: semicolon-separated, no header, one question per line, the language comes from the file name:

```text
question;reponse_1;reponse_2;reponse_3;explicit;category
```

- `reponse_1` to `reponse_3` are the answers used by the bot player (at least one).
- `explicit` is `true` or `false`. Games without the premium code only use questions where `explicit` is `false`.
- `category` is one of `quotidien`, `travail`, `couple`, `famille`, `nourriture`, `voyage`, `ecole`, `tech`, `pop`, `absurde`, `animaux`, `sport`, `fete` (or empty).
- No `;` and no line break inside a text; questions are 300 characters max, bot answers 100 max.

Each document also has `lang` (`fr` / `en`), `status` (`approved`, `pending`, `rejected`: only approved questions are played), `source` (`bank`, `ai`, `admin`, `import`), `playCount`, `lastPlayedAt`, `createdAt` and `norm`, the text used to find duplicates (lowercase, no accents, no punctuation, single spaces; unique per language). `explicit` stays the string `"true"` / `"false"`.

### Seeding

```bash
npm run db:seed                       # db/questions/*.csv
npm run db:seed -- path/to/fr.csv     # other files (named fr.csv / en.csv)
```

The script (`db/seed.js`, Node only) uses `MONGODB_URI`, otherwise `databaseUrl` from `config.properties`, like the server. It can be run as often as needed: a question already in the database for that language is skipped, existing documents are never modified (play counts and admin edits are kept), and neither the original text of a bank question edited in the admin panel nor a bank question deleted there is added back. It prints the number of questions inserted, already present and the invalid lines (with their line number and the reason).

At startup, the server migrates old documents (missing fields get `status: approved`, `source: import`, `playCount: 0`; the language is guessed from the text: French accents and common French words → `fr`, otherwise `en`), builds the indexes, and seeds a language automatically (logged) when it has fewer than 50 approved questions, so a fresh install has content.

`db/db.py` (Python, old 5-column format) is **deprecated**: use `npm run db:seed`.

### No repetition

When a game starts, the server picks the questions (`initQuestions` in `functions.js`):

1. approved questions of the game's language; classic games only take `explicit: "false"`, premium games take all of them;
2. a random sample among the questions never played or not played in the last 30 days;
3. if that is not enough, the least recently played ones (random among those played at the same time);
4. `playCount` and `lastPlayedAt` of the chosen questions are updated.

So consecutive games don't repeat a question until the pool of that language is used up. Every query goes through an index (`$match` + `$sample`, nothing is loaded in memory): about 15 ms with 20,000 questions. When the language has fewer questions than the rounds asked, the game starts with what there is and the host sees "Not enough questions in this language"; with none at all, the lobby shows an error.

### Generating questions with AI

Optional, **off by default**. In the admin panel, tab **To review** → **Generate with AI**: choose the language, how many (1 to 50), a category or a free theme, classic or premium. The server (`admin/ai.js`) calls the Anthropic Messages API (`POST /v1/messages`) with a JSON schema ([structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)), a system prompt with the game rules and the content rules (original, short, no hate or slurs, nothing about minors, no real private people, premium = cheeky but not graphic), a few existing questions of that language as style examples and the latest questions to avoid. Every item is validated like the admin form (lengths, no `;` or line break, category), duplicates are dropped, and the rest is saved as `pending` / `ai`: nothing comes up in a game before an admin approves it (approve / reject / edit one by one, or approve all / reject all). Games never wait for the API.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Turns the feature on. Without it the button explains how to turn it on |
| `ANTHROPIC_MODEL` | Model, default `claude-sonnet-5-5` |
| `ANTHROPIC_EFFORT` | `output_config.effort`: `low`, `medium` (default), `high`… or `default` to let the model decide |
| `AI_MAX_PER_HOUR` | Generations per hour (manual and automatic together), default `10` |
| `AI_AUTO_TOPUP` | `true` to generate in the background when a language runs low (default off) |
| `AI_TOPUP_THRESHOLD` | Top-up when a language has fewer approved questions not played for 30 days, default `100` |
| `AI_TOPUP_BATCH` | Questions per automatic batch, default `20` |
| `AI_AUTO_APPROVE` | `true` to approve automatic batches directly (default: they wait in To review) |

The same keys can be set in `config.properties` (`anthropicApiKey`, `anthropicModel`, `anthropicEffort`, `aiMaxPerHour`, `aiAutoTopup`, `aiTopupThreshold`, `aiTopupBatch`, `aiAutoApprove`); environment variables win. `ANTHROPIC_BASE_URL` (default `https://api.anthropic.com`) and `ANTHROPIC_TIMEOUT_MS` (default `60000`) are only meant for tests against a mock server.

The automatic top-up checks every 10 minutes and generates at most one batch per hour (one language at a time, not while 60 AI questions are already waiting for review). A request times out after 60 seconds; errors (bad key, rate limit, invalid answer…) are shown in the panel with the API's reason and written to the activity log, like every generation.

**Costs**: each generation is billed to your Anthropic account. With Claude Sonnet 5.5 (2 $ per million input tokens, 10 $ per million output tokens at the time of writing) a batch of 20 questions uses roughly 2,000–3,000 input tokens and a few thousand output tokens (thinking included): a few cents. Check the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) and set a spending limit in the Anthropic console. Behind nginx, keep `proxy_read_timeout` above 60 s (the provided config uses 120 s).

## Admin panel

`/admin` lets the owner manage the database from a browser, without scripts:

- **Questions**: list with search (case and accent insensitive, in the question and the bot answers), filters (all / classic / premium, language, category, status), pagination; each card shows its language, category, status, source, play count and last game; add, edit (text, bot answers, type, language, category), delete (with an in-page confirmation); CSV import with a preview (`question;reponse_1;reponse_2;reponse_3;explicit[;category[;lang]]`, the old 5-column files still work, a line without `lang` gets the language chosen in the dialog; 1 MB max, questions already in the database for that language or repeated in the file are skipped, errors reported per line); CSV export of the filtered questions (7 columns, can be imported again); duplicate finder.
- **To review**: questions waiting for approval (generated by AI), with approve / reject / edit, approve all / reject all, and **Generate with AI** (see [Generating questions with AI](#generating-questions-with-ai)).
- **Live games**: games in memory with their PIN, phase (lobby, answering, voting…), round, players and scores, premium or not; refreshed every 5 seconds; "End this game" sends the big screen and the players back home.
- **Activity**: audit log of the admin actions (sign-ins, failed sign-ins, changes, imports, ended games), stored in the `admin_log` collection for one year.

Two duplicates are the same question text in the same language, ignoring case, accents, spacing and punctuation. A text can't contain `;` (the CSV separator) or line breaks; questions are 300 characters max, bot answers 100 max, at least one bot answer.

### Turning it on

Without credentials the panel is disabled (`/admin` explains how to turn it on, the API answers 503, and a warning is logged at startup).

1. Create the password hash on the server (12 characters minimum; the password is asked twice, without echo):

   ```bash
   npm run admin:password
   # or, non-interactive: printf '%s' "$PASSWORD" | npm run --silent admin:password
   ```

   It prints one line like `scrypt$32768$8$1$<salt>$<hash>` (scrypt with a random salt).

2. Give the server the user name and the hash, either as environment variables (they win), with **single quotes** because the hash contains `$`:

   ```bash
   export ADMIN_USER='admin'
   export ADMIN_PASSWORD_HASH='scrypt$32768$8$1$...'
   ```

   or in `config.properties`: `adminUser = admin` and `adminPasswordHash = scrypt$32768$8$1$...`. In a systemd unit, `Environment="ADMIN_PASSWORD_HASH=scrypt$32768$..."` works as is; in a docker-compose `.env` file, double each `$` (`$$`).

3. Restart the server and open `https://your-domain/admin`.

Changing the password or the user name signs out every open session.

### Security

- Sessions: random 32-byte token in the `punchline_admin` cookie (`HttpOnly`, `SameSite=Strict`, `Path=/admin`, `Secure` over HTTPS or when `NODE_ENV=production`); only its SHA-256 is stored, in the `admin_sessions` collection, so sessions survive restarts. They expire after 12 hours without activity and 7 days at most (TTL index). Logging out deletes the session.
- Sign-in: 5 attempts per IP per 15 minutes (then HTTP 429 with `Retry-After`), the same message for a wrong user name or password, constant-time comparisons.
- Every change needs the `X-Requested-With` header sent by the panel and an `Origin` (or `Referer`) of the site itself (CSRF protection on top of `SameSite=Strict`).
- Admin responses carry `Cache-Control: no-store`, a strict `Content-Security-Policy` (no inline script, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`; JSON bodies are limited to a few kB, imports to 1 MB; every field is validated on the server; the pages write every value as text.
- Behind nginx, set `TRUST_PROXY=loopback` so that the client IP (rate limit, log) and HTTPS (`Secure` cookie) are read from `X-Forwarded-For` / `X-Forwarded-Proto`, and forward them:

  ```nginx
  location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
  }
  ```

  Without it, every visitor shares the proxy's IP for the sign-in rate limit. Optionally restrict `/admin` further in nginx (`allow` / `deny`, or basic auth).
