#!/usr/bin/env bash
# Punchline - bootstrap of a fresh VPS (Ubuntu 24.04 LTS, or Debian 12), run once as root.
# Safe to run again: every step checks what is already done (re-run it after changing the files
# in deploy/, e.g. to install a new deploy.sh / wrapper / systemd unit / nginx site).
#
#   curl -fsSLO https://raw.githubusercontent.com/APICulter/punchline/main/deploy/setup-vps.sh
#   sudo bash setup-vps.sh --domain punchline.example.com --email you@example.com \
#        --deploy-key "ssh-ed25519 AAAA... github-actions-deploy"
#
# Options:
#   --domain NAME        public domain of the game (required), its DNS A/AAAA records -> this VPS
#   --email ADDRESS      Let's Encrypt account e-mail (without it, no certificate is requested)
#   --repo URL           git repository     (default https://github.com/APICulter/punchline.git)
#   --branch NAME        branch to deploy   (default main)
#   --deploy-key KEY     public SSH key used by GitHub Actions (one "ssh-ed25519 AAAA..." line)
#   --deploy-key-file F  same, read from a file
#   --admin-user NAME    create this sudo user (key-only login, sudo without password) with the
#                        SSH keys of root, so that root login can be disabled safely
#   --skip-ssh-hardening leave /etc/ssh alone
#   --skip-certbot       do not request a certificate
#   --dry-run            print what would be done, change nothing (no root needed)
#
# What it does: punchline system user + deploy user (CI, key only, forced command), Node.js 22
# (NodeSource), MongoDB 8 (official repository, 127.0.0.1 only, authentication on, an admin user
# and an application user with readWrite on the punchline database), MongoDB database tools,
# nginx + certbot, ufw (OpenSSH, 80, 443), fail2ban (sshd), unattended-upgrades, SSH hardening
# (only when a sudo user can log in with a key), the code in /srv/punchline, the systemd service,
# the nightly backup timer, the nginx site and the HTTPS certificate.
#
# Why systemd and not PM2 on the server: systemd is already there (nothing extra running as
# root or installed globally with npm), restarts the game after a crash or a reboot, orders it
# after mongod, sends its logs to the journal (rotated), sandboxes it (ProtectSystem=strict...),
# and the CI deploy only needs `systemctl restart punchline`, a single root action that is easy to
# allow with sudo. PM2 (deploy/ecosystem.config.js) stays available for other setups.
#
# Files written: /etc/punchline/punchline.env (app secrets, 600 punchline), /etc/punchline/
# config.properties (game settings, copied into the checkout at each deploy), /etc/punchline/
# deploy.conf, /etc/punchline/mongodb-admin.env (MongoDB admin password, 600 root),
# /usr/local/sbin/punchline-deploy, /usr/local/lib/punchline/deploy.sh, /etc/sudoers.d/
# punchline-deploy, /etc/systemd/system/punchline*.{service,timer}, /etc/nginx/sites-available/
# punchline, /etc/mongod.conf, /etc/ufw, /etc/fail2ban/jail.d/punchline.local,
# /etc/apt/apt.conf.d/20auto-upgrades, /etc/ssh/sshd_config.d/01-punchline-hardening.conf.
set -euo pipefail
umask 022
export LC_ALL=C.UTF-8 DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------------------------ settings
DOMAIN=""
EMAIL=""
REPO="https://github.com/APICulter/punchline.git"
BRANCH="main"
DEPLOY_KEY=""
ADMIN_USER=""
SKIP_SSH=0
SKIP_CERTBOT=0
DRY_RUN=0

APP_USER=punchline
APP_DIR=/srv/punchline
CI_USER=deploy
ETC_DIR=/etc/punchline
ENV_FILE=$ETC_DIR/punchline.env
CONFIG_FILE=$ETC_DIR/config.properties
DEPLOY_CONF=$ETC_DIR/deploy.conf
MONGO_ADMIN_FILE=$ETC_DIR/mongodb-admin.env
WRAPPER=/usr/local/sbin/punchline-deploy
DEPLOY_LIB=/usr/local/lib/punchline/deploy.sh
SUDOERS_FILE=/etc/sudoers.d/punchline-deploy
NPM_CACHE=/var/cache/punchline/npm
BACKUP_DIR=/var/backups/punchline
NODE_MAJOR=22
MONGO_VERSION=8.0
APP_PORT=3000
MONGO_APP_USER=punchline
MONGO_DB=punchline

STEP=0
WARNINGS=()

# ------------------------------------------------------------------------------------ helpers
ts() { date '+%F %T'; }
step() { STEP=$((STEP + 1)); printf '\n%s ==> [%d] %s\n' "$(ts)" "$STEP" "$*"; }
info() { printf '%s     %s\n' "$(ts)" "$*"; }
warn() { printf '%s     WARNING: %s\n' "$(ts)" "$*" >&2; WARNINGS+=("$*"); }
die() { printf '%s     ERROR: %s\n' "$(ts)" "$*" >&2; exit 1; }

# run a command (or print it in dry-run mode)
run() {
	if ((DRY_RUN)); then
		printf '     [dry-run] %s\n' "$(printf '%q ' "$@")"
		return 0
	fi
	printf '     $ %s\n' "$(printf '%q ' "$@")"
	"$@"
}

# write stdin to a file if its content changed; sets CHANGED=1 when it was written
# usage: put_file PATH MODE OWNER:GROUP [secret]  < content
CHANGED=0
put_file() {
	local dest="$1" mode="$2" owner="$3" secret="${4:-}" tmp
	tmp="$(mktemp)"
	cat > "$tmp"
	CHANGED=0
	if [[ -f "$dest" ]] && cmp -s "$tmp" "$dest" \
		&& [[ "$(stat -c '%a %U:%G' "$dest")" == "$(printf '%o' "$((8#$mode))") $owner" ]]; then
		info "unchanged: $dest"
		rm -f "$tmp"
		return 0
	fi
	CHANGED=1
	if ((DRY_RUN)); then
		info "[dry-run] would write $dest (mode $mode, $owner):"
		if [[ -n "$secret" ]]; then
			sed -E 's/(PASSWORD|_URI|_KEY|_HASH)=.*/\1=<secret>/' "$tmp" | sed 's/^/       | /'
		else
			sed 's/^/       | /' "$tmp"
		fi
		rm -f "$tmp"
		return 0
	fi
	install -D -m "$mode" -o "${owner%%:*}" -g "${owner##*:}" "$tmp" "$dest"
	rm -f "$tmp"
	info "written: $dest"
}

# install a file of the checkout if it changed (CHANGED=1 when it did)
put_from() { put_file "$2" "$3" "$4" < "$1"; }

# set KEY=value in an env file (replaces the line, or appends it)
set_env_key() {
	local file="$1" key="$2" value="$3" tmp
	tmp="$(mktemp)"
	if [[ -f "$file" ]]; then
		grep -v -E "^${key}=" "$file" > "$tmp" || true
	fi
	printf '%s=%s\n' "$key" "$value" >> "$tmp"
	cat "$tmp"
	rm -f "$tmp"
}
get_env_key() {
	if [[ -f "$1" ]]; then sed -n "s/^$2=//p" "$1" | tail -n 1; fi
	return 0
}

user_exists() { getent passwd "$1" >/dev/null; }
pkg_installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'; }
as_app() { run runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_cache="$NPM_CACHE" npm_config_update_notifier=false "$@"; }

TMP_DIR=""
# shellcheck disable=SC2317,SC2329 # called by the EXIT trap (SC2317 on shellcheck < 0.10)
cleanup() { [[ -n "$TMP_DIR" ]] && rm -rf "$TMP_DIR"; return 0; }
trap cleanup EXIT

# ------------------------------------------------------------------------------------ arguments
while (($#)); do
	case "$1" in
		--domain) DOMAIN="${2:-}"; shift 2 ;;
		--email) EMAIL="${2:-}"; shift 2 ;;
		--repo) REPO="${2:-}"; shift 2 ;;
		--branch) BRANCH="${2:-}"; shift 2 ;;
		--deploy-key) DEPLOY_KEY="${2:-}"; shift 2 ;;
		--deploy-key-file) [[ -r "${2:-}" ]] || die "cannot read ${2:-}"; DEPLOY_KEY="$(grep -v '^#' "$2" | head -n 1)"; shift 2 ;;
		--admin-user) ADMIN_USER="${2:-}"; shift 2 ;;
		--skip-ssh-hardening) SKIP_SSH=1; shift ;;
		--skip-certbot) SKIP_CERTBOT=1; shift ;;
		--dry-run) DRY_RUN=1; shift ;;
		-h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) die "unknown option: $1 (see --help)" ;;
	esac
done

[[ -n "$DOMAIN" ]] || die "--domain is required (see --help)"
[[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]] || die "invalid domain: $DOMAIN (lowercase, e.g. punchline.example.com)"
[[ -z "$EMAIL" || "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "invalid e-mail: $EMAIL"
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die "invalid branch: $BRANCH"
[[ "$REPO" =~ ^(https://|git@|ssh://)[A-Za-z0-9@:/._~-]+$ ]] || die "invalid repository URL: $REPO"
[[ -z "$ADMIN_USER" || "$ADMIN_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "invalid user name: $ADMIN_USER"
if [[ -n "$DEPLOY_KEY" ]]; then
	[[ "$DEPLOY_KEY" =~ ^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa|sk-ssh-ed25519@openssh.com)\ [A-Za-z0-9+/=]+(\ [^\"]*)?$ ]] \
		|| die "--deploy-key must be one public key line (ssh-ed25519 AAAA... comment), without options"
	[[ "$DEPLOY_KEY" != *$'\n'* ]] || die "--deploy-key must be a single line"
fi

# ------------------------------------------------------------------------------------ preflight
step "Preflight"
if ((DRY_RUN)); then
	info "DRY RUN: nothing is changed, commands are only printed (state checks still read the system)"
elif [[ "$(id -u)" -ne 0 ]]; then
	die "run it as root: sudo bash $0 ..."
fi

# shellcheck disable=SC1091
. /etc/os-release
OS_ID="${ID:-}"
OS_CODENAME="${VERSION_CODENAME:-}"
case "$OS_ID:${VERSION_ID:-}" in
	ubuntu:24.04) MONGO_REPO_LINE="https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/$MONGO_VERSION multiverse" ;;
	debian:12) MONGO_REPO_LINE="https://repo.mongodb.org/apt/debian bookworm/mongodb-org/$MONGO_VERSION main" ;;
	*)
		if ((DRY_RUN)); then
			warn "unsupported system ${PRETTY_NAME:-?} (dry run: continuing as if Ubuntu 24.04)"
			MONGO_REPO_LINE="https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/$MONGO_VERSION multiverse"
		else
			die "unsupported system ${PRETTY_NAME:-?}: Ubuntu 24.04 LTS or Debian 12 only"
		fi
		;;
esac
info "system: ${PRETTY_NAME:-?} ($OS_CODENAME, $(dpkg --print-architecture 2>/dev/null || uname -m))"
case "$(dpkg --print-architecture 2>/dev/null || echo amd64)" in
	amd64|arm64) ;;
	*) die "MongoDB $MONGO_VERSION packages exist for amd64 and arm64 only" ;;
esac
# MongoDB 5+ needs AVX on x86 (some cheap or old virtual CPUs do not expose it)
if [[ "$(uname -m)" == x86_64 ]] && ! grep -qw avx /proc/cpuinfo; then
	warn "this CPU does not report AVX: MongoDB $MONGO_VERSION will not start (choose another VPS type or CPU model)"
fi
# MongoDB 8.0 stops at startup on Linux kernels 6.19 to 7.0.13 (TCMalloc incompatibility,
# SERVER-121912; fixed by kernel 7.0.14). Ubuntu 24.04's own kernel (6.8) is not affected; some
# providers ship newer kernels. Check before installing anything that would not start.
kernel_affected() {
	local v="$1" major minor patch
	IFS=. read -r major minor patch <<< "${v%%-*}"
	major=${major:-0}; minor=${minor:-0}; patch=${patch//[^0-9]/}; patch=${patch:-0}
	if ((major == 6 && minor >= 19)); then return 0; fi
	if ((major == 7 && minor == 0 && patch < 14)); then return 0; fi
	return 1
}
if kernel_affected "$(uname -r)"; then
	msg="kernel $(uname -r): MongoDB $MONGO_VERSION refuses to start on Linux 6.19 to 7.0.13 (SERVER-121912). Boot the distribution's standard kernel (Ubuntu 24.04: sudo apt install linux-generic, then choose it at boot / ask your provider) or a kernel >= 7.0.14, then run this script again"
	if ((DRY_RUN)); then warn "$msg"; else die "$msg"; fi
fi
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
((mem_mb >= 900)) || warn "only ${mem_mb} MB of RAM: 1 GB or more is recommended for MongoDB + Node.js"
info "domain $DOMAIN, repository $REPO ($BRANCH), e-mail ${EMAIL:-none}"

# ------------------------------------------------------------------------------------ packages
step "Base packages"
BASE_PKGS=(ca-certificates curl gnupg git openssl sudo dnsutils ufw fail2ban python3-systemd
	unattended-upgrades nginx certbot python3-certbot-nginx logrotate
	age rclone rsync)   # backups: encryption, off-site copy, pull by another machine (docs/DEPLOY.md)
missing=()
for p in "${BASE_PKGS[@]}"; do pkg_installed "$p" || missing+=("$p"); done
if ((${#missing[@]})); then
	run apt-get update -q
	run apt-get install -y -q --no-install-recommends "${missing[@]}"
else
	info "all installed"
fi

# ------------------------------------------------------------------------------------ users
step "Users: $APP_USER (runs the game) and $CI_USER (GitHub Actions)"
if user_exists "$APP_USER"; then
	info "$APP_USER exists"
else
	run useradd --system --user-group --home-dir "$APP_DIR" --no-create-home --shell /usr/sbin/nologin "$APP_USER"
fi
# no password, no shell: nobody logs in as punchline
run usermod --shell /usr/sbin/nologin --password '!' "$APP_USER"

if user_exists "$CI_USER"; then
	info "$CI_USER exists"
else
	# a real shell is needed: sshd runs the forced command with it
	run useradd --create-home --user-group --shell /bin/sh "$CI_USER"
fi
# "*" = no password, but the account is not "locked" (sshd refuses keys of locked accounts
# when UsePAM is off); password login is impossible either way
run usermod --password '*' "$CI_USER"

if [[ -n "$ADMIN_USER" ]]; then
	if user_exists "$ADMIN_USER"; then
		info "$ADMIN_USER exists"
	else
		run useradd --create-home --user-group --shell /bin/bash --groups sudo "$ADMIN_USER"
		run usermod --password '*' "$ADMIN_USER"
	fi
	run usermod -aG sudo "$ADMIN_USER"
	admin_home="$(getent passwd "$ADMIN_USER" | cut -d: -f6 || echo "/home/$ADMIN_USER")"
	if [[ ! -s "$admin_home/.ssh/authorized_keys" && -s /root/.ssh/authorized_keys ]]; then
		info "copying root's SSH keys to $ADMIN_USER"
		run install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$admin_home/.ssh"
		run install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" /root/.ssh/authorized_keys "$admin_home/.ssh/authorized_keys"
	fi
	# key-only account: sudo cannot ask for a password it does not have
	if [[ "$(passwd -S "$ADMIN_USER" 2>/dev/null | awk '{print $2}')" != P ]]; then
		printf '%s ALL=(ALL:ALL) NOPASSWD: ALL\n' "$ADMIN_USER" | put_file "/etc/sudoers.d/90-punchline-admin" 440 root:root
	fi
fi

# ------------------------------------------------------------------------------------ Node.js
step "Node.js $NODE_MAJOR (NodeSource)"
if ! [[ -f /etc/apt/sources.list.d/nodesource.list ]]; then
	run install -d -m 755 /etc/apt/keyrings
	if ((DRY_RUN)); then
		run curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key "|" gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
	else
		curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --batch --yes --dearmor -o /etc/apt/keyrings/nodesource.gpg
	fi
fi
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
	| put_file /etc/apt/sources.list.d/nodesource.list 644 root:root
node_repo_changed=$CHANGED
# prefer NodeSource's nodejs over the (older) one of the distribution
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' \
	| put_file /etc/apt/preferences.d/nodejs 644 root:root
if ((node_repo_changed)) || ! pkg_installed nodejs || [[ "$(node -v 2>/dev/null)" != "v$NODE_MAJOR."* ]]; then
	run apt-get update -q
	run apt-get install -y -q nodejs
fi
if ! ((DRY_RUN)); then
	node_version="$(node -p 'process.versions.node')"
	info "node $node_version, npm $(npm -v)"
	# engines in package.json: ^22.22.2
	if [[ "$(printf '%s\n%s\n' "22.22.2" "$node_version" | sort -V | head -n 1)" != "22.22.2" ]]; then
		warn "node $node_version is older than 22.22.2 (package.json engines): apt-get update && apt-get upgrade nodejs"
	fi
fi
NODE_BIN="$(command -v node || echo /usr/bin/node)"

# ------------------------------------------------------------------------------------ MongoDB
step "MongoDB $MONGO_VERSION (official repository)"
if ! [[ -f /etc/apt/sources.list.d/mongodb-org-$MONGO_VERSION.list ]]; then
	if ((DRY_RUN)); then
		run curl -fsSL "https://www.mongodb.org/static/pgp/server-$MONGO_VERSION.asc" "|" gpg --dearmor -o "/usr/share/keyrings/mongodb-server-$MONGO_VERSION.gpg"
	else
		curl -fsSL "https://www.mongodb.org/static/pgp/server-$MONGO_VERSION.asc" | gpg --batch --yes --dearmor -o "/usr/share/keyrings/mongodb-server-$MONGO_VERSION.gpg"
	fi
fi
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-$MONGO_VERSION.gpg] $MONGO_REPO_LINE" \
	| put_file "/etc/apt/sources.list.d/mongodb-org-$MONGO_VERSION.list" 644 root:root
mongo_repo_changed=$CHANGED
if ((mongo_repo_changed)) || ! pkg_installed mongodb-org || ! pkg_installed mongodb-database-tools; then
	run apt-get update -q
	# mongodb-org includes mongod, mongosh and the database tools (mongodump / mongorestore)
	run apt-get install -y -q mongodb-org mongodb-database-tools
fi

# only reachable from this machine, authentication required
put_file /etc/mongod.conf 644 root:root <<'EOF'
# written by punchline deploy/setup-vps.sh
storage:
  dbPath: /var/lib/mongodb
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
net:
  port: 27017
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
security:
  authorization: enabled
EOF
mongo_conf_changed=$CHANGED
run systemctl enable mongod
if ((mongo_conf_changed)); then
	run systemctl restart mongod
else
	run systemctl start mongod
fi

wait_mongo() {
	((DRY_RUN)) && return 0
	local _
	for _ in $(seq 1 60); do
		mongosh --quiet --nodb --eval 'try { new Mongo("mongodb://127.0.0.1:27017").getDB("admin").runCommand({ ping: 1 }); quit(0) } catch (e) { quit(1) }' >/dev/null 2>&1 && return 0
		sleep 1
	done
	die "MongoDB does not answer on 127.0.0.1:27017 (journalctl -u mongod, /var/log/mongodb/mongod.log)"
}
wait_mongo

# run a mongosh script given on stdin; passwords stay out of the process list (temp file, 600)
mongo_js() {
	local file
	[[ -n "$TMP_DIR" ]] || TMP_DIR="$(mktemp -d)"
	file="$TMP_DIR/script.js"
	(umask 077; cat > "$file")
	if ((DRY_RUN)); then
		info "[dry-run] would run a mongosh script ($1)"
		return 0
	fi
	mongosh --quiet --nodb "$file"
	local rc=$?
	rm -f "$file"
	return "$rc"
}

# admin user: created once through the localhost exception (no user exists yet)
mongo_admin_pw="$(get_env_key "$MONGO_ADMIN_FILE" MONGO_ADMIN_PASSWORD)"
if [[ -z "$mongo_admin_pw" ]]; then
	info "creating the MongoDB admin user (password in $MONGO_ADMIN_FILE)"
	mongo_admin_pw="$(openssl rand -hex 24)"
	printf '# MongoDB administrator (root role): mongosh -u admin -p --authenticationDatabase admin\nMONGO_ADMIN_USER=admin\nMONGO_ADMIN_PASSWORD=%s\n' "$mongo_admin_pw" \
		| put_file "$MONGO_ADMIN_FILE" 600 root:root secret
	if ! mongo_js "create admin" <<EOF
const admin = new Mongo("mongodb://127.0.0.1:27017").getDB("admin");
admin.createUser({ user: "admin", pwd: "$mongo_admin_pw", roles: [{ role: "root", db: "admin" }] });
print("admin user created");
EOF
	then
		run rm -f "$MONGO_ADMIN_FILE"
		die "could not create the MongoDB admin user: users already exist but $MONGO_ADMIN_FILE is missing. Put MONGO_ADMIN_USER=admin and MONGO_ADMIN_PASSWORD=... (an existing user with the root role) in $MONGO_ADMIN_FILE (chmod 600) and run this script again."
	fi
else
	info "MongoDB admin user: credentials found in $MONGO_ADMIN_FILE"
fi

# application user: readWrite on the punchline database only; same password on every run
app_uri="$(get_env_key "$ENV_FILE" MONGODB_URI)"
app_pw=""
if [[ "$app_uri" =~ ^mongodb://${MONGO_APP_USER}:([0-9a-f]+)@ ]]; then
	app_pw="${BASH_REMATCH[1]}"
	info "MongoDB application user: password kept from $ENV_FILE"
else
	app_pw="$(openssl rand -hex 24)"
	info "MongoDB application user: new password"
fi
mongo_js "create or update the application user" <<EOF || die "could not create the MongoDB application user (check $MONGO_ADMIN_FILE)"
const admin = new Mongo("mongodb://admin:$mongo_admin_pw@127.0.0.1:27017/admin?authSource=admin").getDB("admin");
const roles = [{ role: "readWrite", db: "$MONGO_DB" }];
if (admin.getUser("$MONGO_APP_USER")) {
  admin.updateUser("$MONGO_APP_USER", { pwd: "$app_pw", roles: roles });
  print("application user updated");
} else {
  admin.createUser({ user: "$MONGO_APP_USER", pwd: "$app_pw", roles: roles });
  print("application user created");
}
EOF
MONGODB_URI="mongodb://${MONGO_APP_USER}:${app_pw}@127.0.0.1:27017/${MONGO_DB}?authSource=admin"

# ------------------------------------------------------------------------------------ code
step "Code in $APP_DIR ($REPO, $BRANCH)"
run install -d -m 755 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
run install -d -m 755 -o "$APP_USER" -g "$APP_USER" "$NPM_CACHE"
if [[ -d "$APP_DIR/.git" ]]; then
	info "already cloned: fetching (the deployed commit is changed by deploy.sh only)"
	as_app git -C "$APP_DIR" remote set-url origin "$REPO"
	as_app git -C "$APP_DIR" fetch --quiet --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
elif [[ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]]; then
	die "$APP_DIR exists, is not empty and is not a git checkout: move it away first"
else
	as_app git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
SRC="$APP_DIR/deploy"
if ((DRY_RUN)) && [[ ! -d "$SRC" ]]; then
	# dry run on a machine without the checkout: use the files next to this script
	SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	info "[dry-run] using the deploy files of $SRC"
fi
[[ -f "$SRC/punchline.service" ]] || die "$SRC/punchline.service not found: is $BRANCH the right branch?"

# ------------------------------------------------------------------------------------ settings
step "Settings in $ETC_DIR"
run install -d -m 750 -o root -g "$APP_USER" "$ETC_DIR"

# punchline.env: secrets and environment of the service (EnvironmentFile), 600 punchline;
# existing values are kept, only MONGODB_URI is (re)written
if [[ -f "$ENV_FILE" ]]; then
	env_base="$(cat "$ENV_FILE")"
else
	env_base="$(sed -e "s#^PUBLIC_URL=.*#PUBLIC_URL=https://$DOMAIN#" -e "s#^PORT=.*#PORT=$APP_PORT#" "$SRC/punchline.env.example")
# Admin panel (/admin): create the hash with
#   cd $APP_DIR && sudo -u $APP_USER npm run --silent admin:password
# then set both lines (single quotes: the hash contains \$) and: sudo systemctl restart punchline
# ADMIN_USER='admin'
# ADMIN_PASSWORD_HASH='scrypt\$...'"
fi
printf '%s\n' "$env_base" > "${TMP_DIR:=$(mktemp -d)}/env"
set_env_key "$TMP_DIR/env" MONGODB_URI "$MONGODB_URI" | put_file "$ENV_FILE" 600 "$APP_USER:$APP_USER" secret
env_changed=$CHANGED
rm -f "$TMP_DIR/env"

# config.properties: game settings (timers, players per room...), copied into the checkout by
# deploy.sh after every checkout. Edit /etc/punchline/config.properties, not the checkout.
if [[ -f "$CONFIG_FILE" ]]; then
	info "kept: $CONFIG_FILE"
	config_changed=0
else
	# the premium code is managed in the admin panel; the database URL comes from MONGODB_URI
	sed -e 's/^premiumCode *=.*/premiumCode =/' "$SRC/../config.properties.example" \
		| put_file "$CONFIG_FILE" 640 "root:$APP_USER"
	config_changed=$CHANGED
fi

printf '# read by /usr/local/lib/punchline/deploy.sh (written by setup-vps.sh)\nBRANCH=%s\nAPP_DIR=%s\nAPP_USER=%s\nSERVICE=punchline\nHEALTH_URL=http://127.0.0.1:%s/healthz\nHEALTH_TIMEOUT=30\n' \
	"$BRANCH" "$APP_DIR" "$APP_USER" "$APP_PORT" | put_file "$DEPLOY_CONF" 644 root:root

# ------------------------------------------------------------------------------------ service
step "systemd service punchline"
sed -e "s#^ExecStart=/usr/bin/node #ExecStart=$NODE_BIN #" \
	-e "s#punchline\.example\.com#$DOMAIN#g" "$SRC/punchline.service" \
	| put_file /etc/systemd/system/punchline.service 644 root:root
unit_changed=$CHANGED
((unit_changed)) && run systemctl daemon-reload
run systemctl enable punchline

# ------------------------------------------------------------------------------------ deploy tooling
step "Deploy tooling (GitHub Actions -> ssh $CI_USER@vps <sha>)"
# root-owned copies OUTSIDE the checkout: what sudo runs cannot be changed by a push
run install -d -m 755 -o root -g root /usr/local/lib/punchline
put_from "$SRC/deploy.sh" "$DEPLOY_LIB" 755 root:root
put_from "$SRC/deploy-wrapper.sh" "$WRAPPER" 755 root:root
run install -d -m 755 -o root -g root /var/lib/punchline-deploy
if ! ((DRY_RUN)); then
	touch /var/log/punchline-deploy.log && chmod 640 /var/log/punchline-deploy.log
fi
put_file /etc/logrotate.d/punchline-deploy 644 root:root <<'EOF'
/var/log/punchline-deploy.log {
	monthly
	rotate 12
	compress
	missingok
	notifempty
}
EOF

# sudo: the deploy user may run the wrapper as root, nothing else (with a 40-hex argument only,
# when this sudo understands regular expressions: 1.9.10+)
sudoers_tmp="$(mktemp)"
printf '# written by punchline deploy/setup-vps.sh: GitHub Actions deploys, nothing else\nDefaults:%s !requiretty\n%s ALL=(root) NOPASSWD: %s ^[0-9a-f]{40}$\n' "$CI_USER" "$CI_USER" "$WRAPPER" > "$sudoers_tmp"
if ! visudo -cqf "$sudoers_tmp" >/dev/null 2>&1; then
	info "this sudo has no regular expressions in rules: the wrapper alone checks the argument"
	printf '# written by punchline deploy/setup-vps.sh: GitHub Actions deploys, nothing else\nDefaults:%s !requiretty\n%s ALL=(root) NOPASSWD: %s\n' "$CI_USER" "$CI_USER" "$WRAPPER" > "$sudoers_tmp"
	visudo -cqf "$sudoers_tmp" >/dev/null || die "sudoers rule rejected by visudo"
fi
put_file "$SUDOERS_FILE" 440 root:root < "$sudoers_tmp"
rm -f "$sudoers_tmp"

# SSH key of GitHub Actions: forced command, no shell, no forwarding, no pty
ci_home="$(getent passwd "$CI_USER" | cut -d: -f6 || true)"
ci_home="${ci_home:-/home/$CI_USER}"
CI_KEYS="$ci_home/.ssh/authorized_keys"
# root-owned: the deploy user cannot change its own restrictions
run install -d -m 755 -o root -g root "$ci_home/.ssh"
# shellcheck disable=SC2016 # $SSH_ORIGINAL_COMMAND is expanded by the deploy user's shell at login, not here
FORCED='command="sudo -n '"$WRAPPER"' \"$SSH_ORIGINAL_COMMAND\"",restrict'
if [[ -n "$DEPLOY_KEY" ]]; then
	key_body="$(awk '{print $1" "$2}' <<< "$DEPLOY_KEY")"
	{
		echo "# GitHub Actions deploy key (setup-vps.sh). restrict = no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc"
		# keep the other keys, replace this one
		if [[ -f "$CI_KEYS" ]]; then
			grep -v -F "$key_body" "$CI_KEYS" | grep -v '^# GitHub Actions deploy key' || true
		fi
		echo "$FORCED $DEPLOY_KEY"
	} | put_file "$CI_KEYS" 644 root:root
elif [[ -s "$CI_KEYS" ]]; then
	info "kept: $CI_KEYS ($(grep -c '^command=' "$CI_KEYS" || true) key(s))"
	if grep -v '^#' "$CI_KEYS" | grep -q -v '^command="sudo -n '; then
		warn "$CI_KEYS has a key without the forced command: remove it"
	fi
else
	warn "no --deploy-key given: CI cannot deploy yet. Run again with --deploy-key \"ssh-ed25519 AAAA...\" (see deploy/README-ci.md)"
fi

# ------------------------------------------------------------------------------------ first deploy
step "First deploy (npm ci --omit=dev, start, health check)"
if ((DRY_RUN)); then
	run "$DEPLOY_LIB" "<sha of origin/$BRANCH>"
else
	first_sha="$(runuser -u "$APP_USER" -- git -C "$APP_DIR" rev-parse "origin/$BRANCH")"
	if "$DEPLOY_LIB" "$first_sha"; then
		info "the game runs $first_sha"
	else
		warn "first deploy failed: journalctl -u punchline -n 50; then: sudo $WRAPPER $first_sha"
	fi
	if ((env_changed || config_changed || unit_changed)) && systemctl is-active --quiet punchline; then
		# settings changed on a re-run while the same commit was already deployed and healthy
		run systemctl restart punchline
	fi
fi

# ------------------------------------------------------------------------------------ backups
step "Nightly MongoDB backup (deploy/backup.sh, 4:30)"
run install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"
sed -e "s#/srv/punchline/#$APP_DIR/#" "$SRC/punchline-backup.service" | put_file /etc/systemd/system/punchline-backup.service 644 root:root
b1=$CHANGED
put_from "$SRC/punchline-backup.timer" /etc/systemd/system/punchline-backup.timer 644 root:root
((b1 || CHANGED)) && run systemctl daemon-reload
run systemctl enable --now punchline-backup.timer

# ------------------------------------------------------------------------------------ nginx + https
step "nginx site for $DOMAIN"
run install -d -m 755 /var/www/certbot
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
nginx_http_only() {
	cat <<EOF
# Punchline, HTTP only until the certificate exists (setup-vps.sh replaces it with the HTTPS site)
map \$http_upgrade \$connection_upgrade {
	default upgrade;
	""      "";
}
server {
	listen 80;
	listen [::]:80;
	server_name $DOMAIN;

	location /.well-known/acme-challenge/ {
		root /var/www/certbot;
	}
	location / {
		proxy_pass http://127.0.0.1:$APP_PORT;
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection \$connection_upgrade;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_set_header X-Forwarded-Host \$host;
		proxy_read_timeout 120s;
	}
}
EOF
}
install_nginx_site() {
	if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
		sed -e "s#punchline\.example\.com#$DOMAIN#g" -e "s#127\.0\.0\.1:3000#127.0.0.1:$APP_PORT#" "$SRC/nginx-punchline.conf" \
			| put_file /etc/nginx/sites-available/punchline 644 root:root
	else
		nginx_http_only | put_file /etc/nginx/sites-available/punchline 644 root:root
	fi
	local changed=$CHANGED
	if [[ ! -L /etc/nginx/sites-enabled/punchline ]]; then
		run ln -sfn /etc/nginx/sites-available/punchline /etc/nginx/sites-enabled/punchline
		changed=1
	fi
	if [[ -e /etc/nginx/sites-enabled/default ]]; then
		run rm -f /etc/nginx/sites-enabled/default
		changed=1
	fi
	run systemctl enable nginx
	if ((changed)); then
		run nginx -t
		run systemctl reload-or-restart nginx
	else
		run systemctl start nginx
	fi
}
install_nginx_site

# certbot's TLS settings, included by the HTTPS site (normally written by the nginx plugin)
ensure_tls_includes() {
	local f
	if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
		f="$(find /usr/lib/python3/dist-packages -name options-ssl-nginx.conf -path '*certbot_nginx*' 2>/dev/null | head -n 1)"
		if [[ -n "$f" ]]; then
			run install -m 644 "$f" /etc/letsencrypt/options-ssl-nginx.conf
		else
			printf 'ssl_session_cache shared:le_nginx_SSL:10m;\nssl_session_timeout 1440m;\nssl_session_tickets off;\nssl_protocols TLSv1.2 TLSv1.3;\nssl_prefer_server_ciphers off;\n' \
				| put_file /etc/letsencrypt/options-ssl-nginx.conf 644 root:root
		fi
	fi
	if [[ ! -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
		f="$(find /usr/lib/python3/dist-packages -name ssl-dhparams.pem -path '*certbot*' 2>/dev/null | head -n 1)"
		if [[ -n "$f" ]]; then
			run install -m 644 "$f" /etc/letsencrypt/ssl-dhparams.pem
		else
			run openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
		fi
	fi
}

# does the domain point to this server?
dns_points_here() {
	local resolved mine ip
	if command -v dig >/dev/null; then
		resolved="$( { dig +short A "$DOMAIN" @1.1.1.1; dig +short AAAA "$DOMAIN" @1.1.1.1; dig +short A "$DOMAIN"; } 2>/dev/null | grep -E '^[0-9a-f.:]+$' | sort -u || true)"
	else
		resolved="$(getent ahosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u || true)"
	fi
	[[ -n "$resolved" ]] || { info "$DOMAIN does not resolve yet"; return 1; }
	mine="$( { ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1; curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null; echo; curl -6 -fsS --max-time 5 https://api64.ipify.org 2>/dev/null; echo; } | grep -E '^[0-9a-f.:]+$' | sort -u || true)"
	info "$DOMAIN resolves to: $(tr '\n' ' ' <<< "$resolved")"
	info "this server: $(tr '\n' ' ' <<< "$mine")"
	for ip in $resolved; do
		grep -qxF "$ip" <<< "$mine" && return 0
	done
	return 1
}

step "HTTPS certificate (Let's Encrypt)"
if [[ -f "$CERT_DIR/fullchain.pem" ]]; then
	info "certificate exists ($CERT_DIR), renewed by certbot.timer"
	ensure_tls_includes
	install_nginx_site
elif ((SKIP_CERTBOT)); then
	warn "--skip-certbot: the site is HTTP only. Later: sudo bash $0 --domain $DOMAIN --email you@example.com"
elif [[ -z "$EMAIL" ]]; then
	warn "no --email: no certificate requested, the site is HTTP only. Run again with --email you@example.com"
elif ! dns_points_here; then
	warn "the DNS of $DOMAIN does not point to this server yet: certificate skipped (HTTP only). Create the A (and AAAA) records, wait for them to propagate (dig +short $DOMAIN), then run this script again with the same options."
else
	if run certbot certonly --nginx --non-interactive --agree-tos --no-eff-email \
		--email "$EMAIL" -d "$DOMAIN" --deploy-hook "systemctl reload nginx"; then
		ensure_tls_includes
		install_nginx_site
	else
		warn "certbot failed (see /var/log/letsencrypt/letsencrypt.log); the site stays HTTP only. Run this script again once fixed."
	fi
fi

# ------------------------------------------------------------------------------------ firewall
step "Firewall (ufw): OpenSSH, 80, 443"
ssh_ports="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -u || true)"
run ufw default deny incoming
run ufw default allow outgoing
run ufw allow OpenSSH
for p in $ssh_ports; do
	[[ "$p" == 22 ]] || run ufw allow "$p/tcp" comment "sshd"
done
run ufw allow 80/tcp
run ufw allow 443/tcp
run ufw --force enable
((DRY_RUN)) || ufw status verbose | sed 's/^/     /'

# ------------------------------------------------------------------------------------ fail2ban
step "fail2ban (sshd jail)"
put_file /etc/fail2ban/jail.d/punchline.local 644 root:root <<EOF
# written by punchline deploy/setup-vps.sh
[sshd]
enabled = true
backend = systemd
port = $(tr '\n' ',' <<< "${ssh_ports:-22}" | sed 's/,$//')
maxretry = 5
findtime = 10m
bantime = 1h
EOF
run systemctl enable fail2ban
if ((CHANGED)); then run systemctl restart fail2ban; else run systemctl start fail2ban; fi
if ! ((DRY_RUN)); then
	sleep 2
	if fail2ban-client status sshd >/dev/null 2>&1; then info "sshd jail active"; else warn "fail2ban sshd jail is not active: journalctl -u fail2ban"; fi
fi

# ------------------------------------------------------------------------------------ updates
step "Automatic security updates (unattended-upgrades)"
put_file /etc/apt/apt.conf.d/20auto-upgrades 644 root:root <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
run systemctl enable --now unattended-upgrades
info "security updates of $OS_ID are automatic; Node.js and MongoDB (their own repositories) are upgraded by hand: apt-get update && apt-get upgrade"

# ------------------------------------------------------------------------------------ ssh
step "SSH hardening (no root login, no passwords)"
# a sudo user that can log in with a key and use sudo: otherwise hardening could lock the owner out
sudo_key_users=()
for u in $(getent group sudo | cut -d: -f4 | tr ',' ' '); do
	[[ "$u" == "$CI_USER" ]] && continue
	home="$(getent passwd "$u" | cut -d: -f6)"
	keys="$home/.ssh/authorized_keys"
	[[ -s "$keys" ]] || continue
	ssh-keygen -lf "$keys" >/dev/null 2>&1 || continue
	# sudo needs a password the user knows, or a NOPASSWD rule
	if [[ "$(passwd -S "$u" 2>/dev/null | awk '{print $2}')" == P ]] || sudo -l -U "$u" 2>/dev/null | grep -q 'NOPASSWD: ALL'; then
		sudo_key_users+=("$u")
	fi
done
if ((SKIP_SSH)); then
	info "--skip-ssh-hardening: /etc/ssh left as is"
elif ((${#sudo_key_users[@]} == 0)); then
	warn "SSH hardening SKIPPED: no sudo user with an SSH key (and a usable sudo) was found, disabling root login would lock you out. Create one (e.g. run this script again with --admin-user yourname, it copies root's keys), log in with it in a NEW terminal, check 'sudo -v', then run this script again."
else
	info "sudo users with an SSH key: ${sudo_key_users[*]}"
	put_file /etc/ssh/sshd_config.d/01-punchline-hardening.conf 644 root:root <<'EOF'
# written by punchline deploy/setup-vps.sh (the first value read wins: keep this file first)
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 4
X11Forwarding no
EOF
	if ((CHANGED)) && ! ((DRY_RUN)); then
		if sshd -t; then
			systemctl try-reload-or-restart ssh.service 2>/dev/null || systemctl try-reload-or-restart sshd.service 2>/dev/null || true
			info "sshd reloaded. KEEP THIS SESSION OPEN and check a new login: ssh ${sudo_key_users[0]}@$DOMAIN"
		else
			rm -f /etc/ssh/sshd_config.d/01-punchline-hardening.conf
			warn "sshd -t rejected the hardening file: removed, SSH unchanged"
		fi
	fi
fi

# ------------------------------------------------------------------------------------ summary
step "Summary"
if ! ((DRY_RUN)); then
	health="$(curl -s --max-time 5 "http://127.0.0.1:$APP_PORT/healthz" || echo 'no answer')"
	info "health: $health"
	info "deployed: $(runuser -u "$APP_USER" -- git -C "$APP_DIR" log -1 --format='%h %s' 2>/dev/null || echo '?')"
fi
cat <<EOF

  Site:            https://$DOMAIN   (http:// until the certificate exists)
  Code:            $APP_DIR (deployed by: sudo $WRAPPER <sha>)
  Secrets:         $ENV_FILE (app), $MONGO_ADMIN_FILE (MongoDB admin)
  Game settings:   $CONFIG_FILE (copied into the checkout at each deploy)
  Logs:            journalctl -u punchline -f   |   /var/log/punchline-deploy.log
  Deploy status:   sudo $DEPLOY_LIB --status

  GitHub (Settings > Secrets and variables > Actions, environment "production"):
    VPS_HOST         $DOMAIN
    VPS_PORT         $(head -n 1 <<< "${ssh_ports:-22}") (only if not 22)
    VPS_SSH_KEY      the PRIVATE key matching --deploy-key
    VPS_KNOWN_HOSTS  these lines (host keys of this server, read locally):
EOF
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
	[[ -r "$f" ]] || continue
	port="$(head -n 1 <<< "${ssh_ports:-22}")"
	if [[ "${port:-22}" == 22 ]]; then host="$DOMAIN"; else host="[$DOMAIN]:$port"; fi
	printf '      %s %s\n' "$host" "$(cut -d' ' -f1,2 "$f")"
done
cat <<EOF

  Admin panel: cd $APP_DIR && sudo -u $APP_USER npm run --silent admin:password
               then ADMIN_USER / ADMIN_PASSWORD_HASH in $ENV_FILE and: sudo systemctl restart punchline
EOF
if ((${#WARNINGS[@]})); then
	printf '\n  %d warning(s):\n' "${#WARNINGS[@]}"
	printf '   - %s\n' "${WARNINGS[@]}"
fi
((DRY_RUN)) && printf '\n  (dry run: nothing was changed)\n'
exit 0
