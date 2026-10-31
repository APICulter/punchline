# Security

Punchline is a party game: one big screen (the host), one phone per player, an admin panel for the
questions. This page says what is protected, how, what is not, and how to run the server safely.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private reporting on the repository
(**Security > Report a vulnerability**, github.com/APICulter/punchline; the owner has to turn on
"Private vulnerability reporting" in Settings > Code security). Give the version (commit), the
steps to reproduce and the impact. You should get an answer within a week; a fix is released as
soon as possible, then the report is made public.

## Threat model

| Who | Can | Must not be able to |
| --- | --- | --- |
| Anonymous internet user | open the pages, create games, join a lobby with a PIN | drive or end somebody else's game, guess PINs quickly, exhaust memory / CPU, reach files outside `public/`, reach the admin API |
| Malicious player of a game | play, rejoin as themselves | act as the host (start, next question, open votes, remove players, end), answer or vote as another player, read answers before they are shown, crash the other games |
| Admin | manage questions, premium code, end games, read the audit log | (trusted) |
| Stolen admin session (cookie) | everything the admin can, until it expires (12 h idle, 7 days max) or the password changes | survive a password change; be used from another site (CSRF) |
| Compromised dependency | run code in the Node process (same as a compromised server) | — mitigations: lockfile, `npm audit` in CI, Dependabot, systemd sandbox |
| Compromised server | read everything: MongoDB, secrets of the environment, live games | — out of scope; backups, secrets outside the repository and least privilege limit the damage |

## What is protected, and how

**Game (socket.io, `app.js`)**
- Host token: the screen that creates a game receives a random token (192 bits, `newGame` 2nd
  argument, kept in its `sessionStorage`). Only a page that presents it becomes the host's socket;
  every host event (`startGame`, `getQuestion`, `startPrompt`, `timeIsUpToAnswer`, `getVotes`,
  `deletePlayer`, `setGameLang`, `endGame`) is accepted only from that socket. Knowing the PIN is
  not enough. The token is saved with the game, so the host survives a server restart.
- Players: a rejoin token per player (192 bits, compared in constant time). An answer is accepted
  only from the player's socket or with the player's token; a vote only from the player's socket;
  answers are sent without authors until the votes reveal; `getAnswers` / `getScores` answer only
  the screens of the game.
- Inputs: every value is converted to a string, cut to 1000 characters, sanitized (DOMPurify),
  checked (PIN 4 digits, name 1-25, answer 1-99, timers within the lobby bounds, language in a
  list); control characters and bidirectional overrides are removed from names and answers. The
  pages display player text with `textContent` only.
- Abuse limits (defaults, environment variables in brackets). A party is often 10+ phones behind
  one public address, so per-address limits are high; IPv6 addresses are counted per /64.
  - message size 32 KB (`SOCKET_MAX_MESSAGE_BYTES`), larger messages close the connection;
  - 200 open sockets per address (`SOCKET_MAX_CONNECTIONS_PER_IP`), 300 new connections per
    address per minute (`SOCKET_MAX_CONNECTS_PER_IP_PER_MINUTE`);
  - per socket: 60 events burst, 15 per second (`SOCKET_EVENT_BURST`, `SOCKET_EVENTS_PER_SECOND`);
    extra events are dropped, a socket that keeps flooding is disconnected;
  - games: 2000 in memory (`MAX_GAMES`), 30 open per address (`MAX_GAMES_PER_IP`), 5 per socket;
    empty games are removed after 10 minutes;
  - PIN guessing: unknown PIN / player / token answers, 20 per socket and 60 per address per
    10 minutes (`PIN_MISSES_PER_IP`), then `error.tooManyAttempts`;
  - premium code: 10 wrong codes per address per 15 minutes.
- Cross-site sockets are refused: a browser `Origin` must be this site (Host header,
  `X-Forwarded-Host` from a trusted proxy, `PUBLIC_URL`, `punchlineURL`, or
  `SOCKET_ALLOWED_ORIGINS`, comma-separated URLs). Clients without `Origin` are accepted.
- Client address: `X-Forwarded-*` are read only from a trusted proxy (`TRUST_PROXY`), and
  `X-Forwarded-For` from the right (the left part is written by the client).
- One game's error aborts only that game, and only if the sender belongs to it.

**HTTP (Express)**
- Every response: `Content-Security-Policy` (game pages: `default-src 'self'`, no inline script or
  handler, no inline style attribute, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy` / `-Resource-Policy: same-origin`,
  `Permissions-Policy` (camera, microphone, geolocation, payment, usb off). HSTS is set by nginx.
- Only `public/` is served (dotfiles ignored); `public/admin/*.html` only through the admin
  routes. `config.properties`, `.git`, `db/`, `deploy/`, `node_modules/` are not reachable. Any
  other path redirects to `/`. Errors answer `Internal server error` (details only in the logs).
- `/healthz` gives the status and MongoDB state; game count and uptime only to local requests
  without `X-Forwarded-For`.

**Admin panel (`admin/`)** — see also README, "Admin panel > Security".
- Password: scrypt hash only (`npm run admin:password`), constant-time checks, 5 attempts per
  address (IPv6 /64) per 15 minutes, at most 4 verifications at once.
- Sessions: 32 random bytes in an `HttpOnly`, `SameSite=Strict`, `Path=/admin` cookie (`Secure`
  over HTTPS / in production), stored hashed in MongoDB, 12 h idle / 7 days max, a new token at
  every login (the previous one is deleted), all invalidated when the user or password changes.
- CSRF: `X-Requested-With` header + same-origin `Origin` / `Referer` on every change.
- Strict CSP without inline code, `no-store`, small JSON bodies, CSV import max 1 MB / 10,000
  lines, dry run before import, every field validated, MongoDB queries built from validated values
  only (no operator from user input, escaped search regex).
- AI generation (optional): the theme is length-limited and quoted as data; the model output is
  validated like the admin form (lengths, characters, category, language, explicit flag) and saved
  as **pending**: an admin approves it. Exception: `AI_AUTO_APPROVE=true` for the automatic
  top-up (off by default).
- Audit log (`admin_log`, kept one year): logins (success / failure with the typed user name),
  question changes, imports, AI runs, premium code changes (never the code), games ended; with the
  user and the client address.

**Secrets**: the admin hash, the MongoDB URI and the Anthropic key are read from the environment
(or `config.properties`: listed in `.gitignore` but still tracked, see below; without it the
server falls back to `config.properties.example`); the premium code lives in MongoDB.
Logs never contain tokens, passwords, the premium code or player answers; rate-limit warnings
contain the client address (or its /64).

## Known limits and residual risks

- A 4-digit PIN is guessable by a distributed attacker (many addresses): the limits above slow it
  down, they do not prevent it. Whoever has the PIN can join a lobby (the host can remove them) and,
  during a game, take the place of a player whose phone has been disconnected for more than 3
  seconds (players without a saved token pick their name; this is how a lost phone rejoins).
- Per-address limits are shared: many users behind one carrier-grade NAT share one budget, and an
  abuser behind the same address can use it up (players then see "too many attempts" for a while).
- Memory DoS: a distributed attacker can fill `MAX_GAMES` with empty lobbies (they live while
  their socket is open). Add connection limits in nginx if this happens.
- The host can only cheat in their own game (e.g. skip timers); timers are driven by the host page.
- `config.properties` is still tracked by git in the existing history: keep secrets in the
  environment (`/etc/punchline/punchline.env`), not in that file. Old commits only contain
  placeholder values.
- Rejoin and host tokens are stored in clear in the `games` collection (needed to resume games);
  they are worth nothing once the game is over (7-day TTL).
- The audit log and backups contain client addresses (personal data): one-year TTL for the log.
- A stolen admin session is valid until it expires; there is no "sign out everywhere" button other
  than changing the password (or deleting the `admin_sessions` documents).
- The CSV export does not neutralise spreadsheet formulas (`=`, `+`, `-`, `@` at the start of a
  text): open exports as text, or only import them back.
- `mongoose` 7 and `express` 4 are older major versions: no known vulnerability today (`npm audit`
  clean), plan the upgrade.
- Browsers that do not treat `wss:` as `'self'` in `connect-src` (very old Safari) fall back to
  HTTP long-polling, which still works.

## Operations checklist (server)

- [ ] Node.js LTS from the official packages, kept up to date; `unattended-upgrades` on.
- [ ] Run the app as a dedicated unprivileged user under systemd (`deploy/punchline.service`:
      `ProtectSystem=strict`, `NoNewPrivileges`, ...) or PM2 — one instance only.
- [ ] `HOST=127.0.0.1`: the Node port is only reachable through nginx. Firewall: SSH, 80, 443 only.
- [ ] nginx in front with HTTPS (Let's Encrypt), HSTS, `server_tokens off;`, and
      `TRUST_PROXY=loopback` for the app; `PUBLIC_URL=https://your-domain`.
- [ ] Optional nginx limits: `limit_req` on `/admin/api/login`, `limit_conn` on `/socket.io/`.
- [ ] MongoDB bound to 127.0.0.1 with authorization on; the app user only has `readWrite` on its
      database; `MONGODB_URI` with that user in the environment file.
- [ ] Secrets only in `/etc/punchline/punchline.env` (mode 600; systemd reads `EnvironmentFile`
      as root, so it can belong to root): `ADMIN_USER`, `ADMIN_PASSWORD_HASH` (single-quoted:
      it contains `$`), `MONGODB_URI`, `ANTHROPIC_API_KEY`. Never in git, never in
      `config.properties` of the checkout.
- [ ] A long, unique admin password; the hash made with `npm run admin:password`.
- [ ] Premium code generated in the admin panel (Settings), not a short word.
- [ ] `AI_AUTO_APPROVE` left off; an Anthropic key with a spending limit.
- [ ] `npm ci --omit=dev` from the lockfile on deploy; CI runs `npm audit`; Dependabot PRs
      reviewed and merged.
- [ ] Logs (journal or PM2) rotated; watch for `rate limit reached`, `event flood`, `login.failed`.
- [ ] Backups of MongoDB (encrypted if stored off the server), restore tested.
- [ ] After an incident: change the admin password (closes every session), regenerate the premium
      code, rotate the MongoDB password and the Anthropic key.
