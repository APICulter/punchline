#!/usr/bin/env bash
# Punchline - MongoDB backup: dump, check, encrypt, rotate, copy off the server.
#
# Usage:   deploy/backup.sh            (run by the punchline-backup.timer, or by hand)
# Restore: see docs/DEPLOY.md, "Restoring a backup"
#
# Designed to survive a compromised server: an attacker who controls the VPS can delete
# everything the VPS can delete. So the copies that matter live elsewhere, written by
# credentials that cannot delete or overwrite (B2/S3 with Object Lock, an upload-only
# key, rclone --ignore-existing), or pulled by another machine (deploy/backup-pull.sh).
# Encrypted with age to a public key: the private key never goes on the server, so a
# stolen backup (or a stolen server) does not give the data away.
#
# Settings (environment variables, or the same keys in /etc/punchline/punchline.env):
#   MONGODB_URI           database to back up       (default mongodb://127.0.0.1:27017/punchline)
#   BACKUP_DIR            where the archives go      (default /var/backups/punchline)
#   BACKUP_KEEP_DAILY     daily archives to keep     (default 14)
#   BACKUP_KEEP_WEEKLY    Sunday archives to keep    (default 8)
#   BACKUP_AGE_RECIPIENT  age public key ("age1…"); when set, archives are encrypted (.gz.age)
#                         and no plaintext copy is kept. Strongly recommended.
#   BACKUP_RCLONE_REMOTE  off-site copy with rclone, e.g. "b2-backup:my-bucket/punchline"
#                         (upload only: remote files are never replaced or deleted)
#   BACKUP_PING_URL       optional monitoring URL (e.g. https://hc-ping.com/<uuid>): pinged on
#                         success, "<url>/fail" on failure, so a missing backup raises an alert
#
# What is saved: every collection except "games" (games in progress, rebuilt by the server)
# and "admin_sessions" (logins, recreated at the next sign-in).
set -euo pipefail

ENV_FILE="${PUNCHLINE_ENV_FILE:-/etc/punchline/punchline.env}"
KEYS="MONGODB_URI BACKUP_DIR BACKUP_KEEP_DAILY BACKUP_KEEP_WEEKLY BACKUP_AGE_RECIPIENT BACKUP_RCLONE_REMOTE BACKUP_PING_URL"
if [[ -r "$ENV_FILE" ]]; then
	# only the keys this script uses, without executing the file
	while IFS='=' read -r key value; do
		if [[ " $KEYS " == *" $key "* && -z "${!key:-}" ]]; then
			value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
			export "$key=$value"
		fi
	done < <(grep -E '^[A-Z_]+=' "$ENV_FILE" || true)
fi

MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/punchline}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/punchline}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-8}"
RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"
PING="${BACKUP_PING_URL:-}"

log() { printf '%s backup: %s\n' "$(date '+%F %T')" "$*"; }

ping_monitor() {
	[[ -n "$PING" ]] || return 0
	curl -fsS -m 10 --retry 3 -o /dev/null "$PING$1" || log "warning: monitoring ping failed"
}

fail() {
	log "ERROR: $*"
	ping_monitor /fail
	exit 1
}
trap 'fail "unexpected error on line $LINENO"' ERR

command -v mongodump >/dev/null || fail "mongodump not found (install mongodb-database-tools)"
command -v mongorestore >/dev/null || fail "mongorestore not found (install mongodb-database-tools)"
if [[ -n "$RECIPIENT" ]]; then
	command -v age >/dev/null || fail "BACKUP_AGE_RECIPIENT is set but age is not installed (apt install age)"
	[[ "$RECIPIENT" == age1* ]] || fail "BACKUP_AGE_RECIPIENT must be an age public key (age1…)"
fi

umask 077
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

stamp="$(date '+%F_%H%M')"
dump="$BACKUP_DIR/daily/.punchline-$stamp.gz.part"
cleanup() { rm -f -- "$dump" "$dump.age"; }
trap cleanup EXIT

log "dumping"
mongodump --uri="$MONGODB_URI" --gzip --archive="$dump" --quiet \
	--excludeCollection=games --excludeCollection=admin_sessions \
	|| fail "mongodump failed"

# check that the archive can be read back before trusting it (nothing is written)
mongorestore --gzip --archive="$dump" --dryRun --quiet >/dev/null 2>&1 \
	|| fail "the archive can't be read back, kept nothing"

if [[ -n "$RECIPIENT" ]]; then
	age -r "$RECIPIENT" -o "$dump.age" "$dump" || fail "encryption failed"
	archive="$BACKUP_DIR/daily/punchline-$stamp.gz.age"
	mv -- "$dump.age" "$archive"
	rm -f -- "$dump"
else
	archive="$BACKUP_DIR/daily/punchline-$stamp.gz"
	mv -- "$dump" "$archive"
	log "warning: BACKUP_AGE_RECIPIENT is not set, the archive is not encrypted"
fi
log "ok: $(basename "$archive") ($(du -h "$archive" | cut -f1))"

# Sunday: keep a weekly copy
if [[ "$(date +%u)" == "7" ]]; then
	cp -- "$archive" "$BACKUP_DIR/weekly/"
fi

# local rotation (the off-site copies have their own retention, see docs/DEPLOY.md)
prune() {
	local dir="$1" keep="$2" files old i
	shopt -s nullglob
	files=("$dir"/punchline-*.gz "$dir"/punchline-*.gz.age)
	shopt -u nullglob
	(( ${#files[@]} > keep )) || return 0
	# names contain the date and time: sorted by name = sorted by age
	mapfile -t files < <(printf '%s\n' "${files[@]}" | sort -r)
	for (( i = keep; i < ${#files[@]}; i++ )); do
		old="${files[$i]}"
		rm -f -- "$old"
		log "deleted $(basename "$old")"
	done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

# off-site copy: upload only. "copy" (never "sync") + --ignore-existing: an existing remote
# file is never replaced or deleted, even if the local one changed or disappeared (--immutable
# is not enough: rclone ignores it when copying a single file). With a B2/S3 key that has no
# delete permission and Object Lock on the bucket, the server can't erase them either.
if [[ -n "$REMOTE" ]]; then
	command -v rclone >/dev/null || fail "BACKUP_RCLONE_REMOTE is set but rclone is not installed"
	log "copying to $REMOTE"
	rclone copy "$archive" "$REMOTE/daily/" --ignore-existing --quiet || fail "off-site copy failed"
	if [[ "$(date +%u)" == "7" ]]; then
		rclone copy "$archive" "$REMOTE/weekly/" --ignore-existing --quiet || fail "off-site weekly copy failed"
	fi
	log "off-site copy ok"
fi

ping_monitor ""
