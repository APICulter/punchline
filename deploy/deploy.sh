#!/usr/bin/env bash
# Punchline - deploy one commit of the main branch on the VPS, with automatic rollback.
#
# Usage (as root):
#   deploy.sh <40-hex commit SHA>   deploy this commit (it must be on origin/main)
#   deploy.sh --rollback            go back to the commit deployed before the current one
#   deploy.sh --status              show what is deployed and whether it is healthy
#
# GitHub Actions does not call this file directly: it runs `ssh deploy@vps <sha>`, the SSH key
# of the deploy user is bound to /usr/local/sbin/punchline-deploy (deploy/deploy-wrapper.sh),
# which checks the SHA and runs the ROOT-OWNED copy of this script, /usr/local/lib/punchline/deploy.sh
# (installed by deploy/setup-vps.sh; re-run setup-vps.sh after changing this file).
# By hand: sudo punchline-deploy <sha>   or   sudo /usr/local/lib/punchline/deploy.sh --rollback
#
# Steps: lock (one deploy at a time) -> git fetch -> the SHA must be on origin/main -> checkout
# (as the punchline user) -> /etc/punchline/config.properties copied over config.properties ->
# npm ci --omit=dev only when package-lock.json (or Node.js) changed -> systemctl restart
# (the server saves the games on SIGTERM and restores them at startup) -> wait up to 30 s for
# GET /healthz = 200 -> on failure: the previous commit is checked out again, restarted, and the
# script exits non-zero.
#
# The CSS is not built here: public/css/style.css is committed and CI checks it is up to date
# (Tailwind is a devDependency, not installed on the server).
#
# Exit codes: 0 deployed (or already deployed and healthy), 1 failed and rolled back (or nothing
# to roll back to), 2 failed AND the rollback failed too (the site is probably down), 64 bad usage,
# 75 another deploy is running.
#
# Settings: /etc/punchline/deploy.conf (written by setup-vps.sh, KEY=value lines, only the keys
# below are read) and, when run by hand, PUNCHLINE_* environment variables (they win).
#   BRANCH          branch that may be deployed             (main)
#   APP_DIR         git checkout of the game                (/srv/punchline)
#   APP_USER        user that owns the checkout / runs npm  (punchline)
#   SERVICE         systemd unit                            (punchline)
#   HEALTH_URL      health check                            (http://127.0.0.1:$PORT/healthz, PORT from punchline.env, default 3000)
#   HEALTH_TIMEOUT  seconds to wait for a 200               (30)
set -euo pipefail
umask 022
export LC_ALL=C.UTF-8

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin${PATH:+:$PATH}

DEPLOY_CONF="${PUNCHLINE_DEPLOY_CONF:-/etc/punchline/deploy.conf}"
declare -A conf=()
if [[ -r "$DEPLOY_CONF" ]]; then
	# read, never source: only whitelisted keys
	while IFS='=' read -r key value; do
		value="${value%\"}"; value="${value#\"}"
		case "$key" in
			BRANCH|APP_DIR|APP_USER|SERVICE|HEALTH_URL|HEALTH_TIMEOUT) conf[$key]="$value" ;;
		esac
	done < <(grep -E '^[A-Z_]+=' "$DEPLOY_CONF" || true)
fi

BRANCH="${PUNCHLINE_BRANCH:-${conf[BRANCH]:-main}}"
APP_DIR="${PUNCHLINE_DIR:-${conf[APP_DIR]:-/srv/punchline}}"
APP_USER="${PUNCHLINE_USER:-${conf[APP_USER]:-punchline}}"
SERVICE="${PUNCHLINE_SERVICE:-${conf[SERVICE]:-punchline}}"
HEALTH_TIMEOUT="${PUNCHLINE_HEALTH_TIMEOUT:-${conf[HEALTH_TIMEOUT]:-30}}"
HEALTH_URL="${PUNCHLINE_HEALTH_URL:-${conf[HEALTH_URL]:-}}"
ENV_FILE="${PUNCHLINE_ENV_FILE:-/etc/punchline/punchline.env}"
CONFIG_OVERLAY="${PUNCHLINE_CONFIG:-/etc/punchline/config.properties}"
STATE_DIR="${PUNCHLINE_STATE_DIR:-/var/lib/punchline-deploy}"
LOG_FILE="${PUNCHLINE_DEPLOY_LOG:-/var/log/punchline-deploy.log}"
LOCK_FILE="${PUNCHLINE_DEPLOY_LOCK:-/run/lock/punchline-deploy.lock}"
LOCK_WAIT="${PUNCHLINE_DEPLOY_LOCK_WAIT:-300}"
NPM_CACHE="${PUNCHLINE_NPM_CACHE:-/var/cache/punchline/npm}"
# tests only (a stand-in for systemctl); the wrapper runs this script with an empty environment
SYSTEMCTL="${PUNCHLINE_SYSTEMCTL:-systemctl}"

log() { printf '%s deploy[%d]: %s\n' "$(date '+%F %T')" "$$" "$*"; }
die() { local code="${2:-1}"; log "ERROR: $1"; exit "$code"; }
usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 64; }

# ---------------------------------------------------------------- arguments
MODE=""
TARGET=""
case "${1:-}" in
	--status) MODE=status ;;
	--rollback) MODE=rollback ;;
	-h|--help) usage ;;
	*)
		[[ $# -eq 1 && "$1" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy.sh: expected a full 40-character lowercase commit SHA, --rollback or --status" >&2; exit 64; }
		MODE=deploy
		TARGET="$1"
		;;
esac
[[ $# -le 1 ]] || usage

[[ "$(id -u)" -eq 0 ]] || { echo "deploy.sh: run it as root (sudo)" >&2; exit 64; }
[[ -d "$APP_DIR/.git" ]] || { echo "deploy.sh: $APP_DIR is not a git checkout (run deploy/setup-vps.sh first)" >&2; exit 1; }
[[ "$HEALTH_TIMEOUT" =~ ^[0-9]+$ ]] || HEALTH_TIMEOUT=30

if [[ -z "$HEALTH_URL" ]]; then
	port=""
	[[ -r "$ENV_FILE" ]] && port="$(sed -n 's/^PORT=["]\{0,1\}\([0-9]\{1,5\}\)["]\{0,1\}$/\1/p' "$ENV_FILE" | tail -n 1)"
	HEALTH_URL="http://127.0.0.1:${port:-3000}/healthz"
fi

# ---------------------------------------------------------------- helpers
# run a command as the owner of the checkout (git and npm never run as root)
as_app() {
	if [[ "$(id -un)" == "$APP_USER" ]]; then
		env HOME="$APP_DIR" npm_config_cache="$NPM_CACHE" npm_config_update_notifier=false "$@"
	else
		runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm_config_cache="$NPM_CACHE" npm_config_update_notifier=false "$@"
	fi
}
git_app() { as_app git -C "$APP_DIR" "$@"; }

healthy_once() {
	local code
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" 2>/dev/null || true)"
	[[ "$code" == "200" ]]
}

wait_healthy() {
	local deadline=$((SECONDS + HEALTH_TIMEOUT))
	sleep 1
	while ((SECONDS < deadline)); do
		if healthy_once; then
			log "health check ok ($HEALTH_URL)"
			return 0
		fi
		sleep 1
	done
	log "health check: no HTTP 200 from $HEALTH_URL within ${HEALTH_TIMEOUT}s"
	return 1
}

show_service_logs() {
	log "last lines of the service log:"
	if [[ "$SYSTEMCTL" == systemctl ]] && command -v journalctl >/dev/null 2>&1; then
		journalctl -u "$SERVICE" -n 25 --no-pager -o cat 2>/dev/null || true
	fi
	"$SYSTEMCTL" status "$SERVICE" --no-pager -n 0 2>/dev/null || true
}

# config.properties is read from the checkout by the server: the server's own copy lives in
# /etc/punchline/config.properties and is put back after every checkout
overlay_config() {
	if [[ -f "$CONFIG_OVERLAY" ]]; then
		install -m 640 -o "$APP_USER" -g "$APP_USER" "$CONFIG_OVERLAY" "$APP_DIR/config.properties"
	elif [[ ! -f "$APP_DIR/config.properties" ]]; then
		log "WARNING: no $CONFIG_OVERLAY and no config.properties in the checkout: using config.properties.example"
		install -m 640 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/config.properties.example" "$APP_DIR/config.properties"
	fi
}

# node_modules are reinstalled only when package-lock.json or the Node.js version changed
deps_key() {
	printf '%s %s\n' "$(sha256sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)" "$(node -v)"
}
ensure_deps() {
	local key
	key="$(deps_key)"
	if [[ -d "$APP_DIR/node_modules" && -f "$STATE_DIR/deps" && "$(cat "$STATE_DIR/deps")" == "$key" ]]; then
		log "dependencies unchanged, npm ci skipped"
		return 1
	fi
	log "installing dependencies: npm ci --omit=dev"
	rm -f "$STATE_DIR/deps"
	(cd "$APP_DIR" && as_app npm ci --omit=dev --no-audit --no-fund --loglevel=warn) || return 2
	printf '%s\n' "$key" > "$STATE_DIR/deps"
	return 0
}

# (explicit "|| return": errexit is off inside functions called from an if / || list)
checkout() {
	git_app -c advice.detachedHead=false checkout --quiet --force "$1" || return 1
	overlay_config || return 1
}

restart_service() {
	log "restarting $SERVICE (games in progress are saved and resumed)"
	"$SYSTEMCTL" restart "$SERVICE"
}

# checkout + deps + restart + health check; 0 when the commit runs and answers 200
activate() {
	local sha="$1" rc=0
	log "activating $sha ($(git_app log -1 --format='%h %s' "$sha" 2>/dev/null || echo '?'))"
	checkout "$sha" || { log "checkout of $sha failed"; return 1; }
	ensure_deps || rc=$?
	if ((rc == 2)); then
		log "npm ci failed for $sha"
		return 1
	fi
	restart_service || { log "systemctl restart failed"; return 1; }
	wait_healthy
}

record() { printf '%s %s %s\n' "$(date '+%F %T')" "$1" "$2" >> "$STATE_DIR/history"; }

# ---------------------------------------------------------------- status
if [[ "$MODE" == status ]]; then
	head_sha="$(git_app rev-parse HEAD)"
	echo "deployed:  $head_sha  $(git_app log -1 --format='%cd %s' --date=short HEAD)"
	echo "previous:  $(cat "$STATE_DIR/previous" 2>/dev/null || echo none)"
	echo "branch:    $BRANCH"
	if healthy_once; then echo "health:    ok ($HEALTH_URL)"; else echo "health:    FAILING ($HEALTH_URL)"; fi
	echo "history:"; tail -n 10 "$STATE_DIR/history" 2>/dev/null | sed 's/^/  /' || true
	exit 0
fi

# ---------------------------------------------------------------- log + lock
mkdir -p "$STATE_DIR" "$NPM_CACHE" "$(dirname "$LOCK_FILE")"
chmod 755 "$STATE_DIR"
chown "$APP_USER:" "$NPM_CACHE" 2>/dev/null || true
if touch "$LOG_FILE" 2>/dev/null; then
	chmod 640 "$LOG_FILE"
	exec > >(tee -a "$LOG_FILE") 2>&1
fi

exec 9>"$LOCK_FILE"
if ! flock -w "$LOCK_WAIT" 9; then
	die "another deploy has been running for more than ${LOCK_WAIT}s ($LOCK_FILE)" 75
fi

if [[ "$MODE" == rollback ]]; then
	TARGET="$(cat "$STATE_DIR/previous" 2>/dev/null || true)"
	[[ "$TARGET" =~ ^[0-9a-f]{40}$ ]] || die "no previous deployment recorded in $STATE_DIR/previous"
	log "rollback requested: back to $TARGET"
fi

log "=== deploy $TARGET (branch $BRANCH, $APP_DIR, by ${SUDO_USER:-$(id -un)}) ==="

# ---------------------------------------------------------------- checks
log "fetching origin/$BRANCH"
git_app fetch --quiet --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" \
	|| die "git fetch failed"

git_app cat-file -e "$TARGET^{commit}" 2>/dev/null \
	|| die "unknown commit $TARGET (not pushed to origin/$BRANCH yet, or not on it): refused"
git_app merge-base --is-ancestor "$TARGET" "origin/$BRANCH" \
	|| die "commit $TARGET is not on origin/$BRANCH: refused"

CURRENT="$(git_app rev-parse HEAD)"

# hand edits of tracked files on the server would be lost by the checkout: refuse
# (config.properties excepted: it is rewritten from /etc/punchline/config.properties)
dirty="$(git_app status --porcelain --untracked-files=no | grep -v -E '^.. config\.properties$' || true)"
if [[ -n "$dirty" ]]; then
	log "local changes in the checkout:"
	printf '%s\n' "$dirty"
	die "tracked files were edited on the server; commit them to the repository or run: sudo -u $APP_USER git -C $APP_DIR checkout -- ."
fi

# this script is a root-owned copy: tell when the repository has a newer version
self="$(readlink -f "${BASH_SOURCE[0]}")"
if [[ "$self" != "$APP_DIR/deploy/deploy.sh" ]] && ! git_app show "$TARGET:deploy/deploy.sh" 2>/dev/null | cmp -s - "$self"; then
	log "NOTE: deploy/deploy.sh in $TARGET differs from $self; re-run deploy/setup-vps.sh to install the new version"
fi

# ---------------------------------------------------------------- same commit
if [[ "$TARGET" == "$CURRENT" ]]; then
	log "$TARGET is already checked out"
	overlay_config
	rc=0
	ensure_deps || rc=$?
	((rc == 2)) && die "npm ci failed"
	if ((rc == 1)) && healthy_once; then
		log "already deployed and healthy: nothing to do"
		record "$TARGET" "already-deployed"
		exit 0
	fi
	restart_service || die "systemctl restart failed"
	if wait_healthy; then
		printf '%s\n' "$TARGET" > "$STATE_DIR/current"
		record "$TARGET" "ok"
		log "=== deployed $TARGET ==="
		exit 0
	fi
	show_service_logs
	record "$TARGET" "failed-no-rollback"
	die "$TARGET does not start and there is no other commit to roll back to"
fi

# ---------------------------------------------------------------- deploy, rollback on failure
log "current: $CURRENT"
if activate "$TARGET"; then
	printf '%s\n' "$CURRENT" > "$STATE_DIR/previous"
	printf '%s\n' "$TARGET" > "$STATE_DIR/current"
	record "$TARGET" "ok (previous $CURRENT)"
	log "=== deployed $TARGET (previous: $CURRENT) ==="
	exit 0
fi

show_service_logs
log "!!! deploy of $TARGET failed: rolling back to $CURRENT"
if activate "$CURRENT"; then
	printf '%s\n' "$CURRENT" > "$STATE_DIR/current"
	record "$TARGET" "failed, rolled back to $CURRENT"
	log "=== rolled back to $CURRENT: the site runs the previous version, $TARGET was NOT deployed ==="
	exit 1
fi

show_service_logs
record "$TARGET" "failed, ROLLBACK FAILED ($CURRENT)"
die "ROLLBACK FAILED: $CURRENT does not answer either. Check: journalctl -u $SERVICE -n 100" 2
