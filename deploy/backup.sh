#!/usr/bin/env bash
# Punchline - MongoDB backup with rotation (and an optional off-site copy).
#
# Usage:   deploy/backup.sh            (run it from cron or the systemd timer)
# Restore: mongorestore --uri="$MONGODB_URI" --gzip --archive=FILE --drop
#
# Settings (environment variables, or the same keys in /etc/punchline/punchline.env):
#   MONGODB_URI          database to back up      (default mongodb://127.0.0.1:27017/punchline)
#   BACKUP_DIR           where the archives go     (default /var/backups/punchline)
#   BACKUP_KEEP_DAILY    daily archives to keep    (default 14)
#   BACKUP_KEEP_WEEKLY   Sunday archives to keep   (default 8)
#   BACKUP_RCLONE_REMOTE optional off-site copy with rclone, e.g. "b2:my-bucket/punchline"
#                        (needs rclone installed and configured: https://rclone.org)
#
# What is saved: every collection except "games" (games in progress, rebuilt by the server)
# and "admin_sessions" (logins, recreated at the next sign-in).
set -euo pipefail

ENV_FILE="${PUNCHLINE_ENV_FILE:-/etc/punchline/punchline.env}"
if [[ -r "$ENV_FILE" ]]; then
	# only the keys this script uses, without executing the file
	while IFS='=' read -r key value; do
		case "$key" in
			MONGODB_URI|BACKUP_DIR|BACKUP_KEEP_DAILY|BACKUP_KEEP_WEEKLY|BACKUP_RCLONE_REMOTE)
				if [[ -z "${!key:-}" ]]; then
					value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
					export "$key=$value"
				fi
				;;
		esac
	done < <(grep -E '^[A-Z_]+=' "$ENV_FILE" || true)
fi

MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/punchline}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/punchline}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-8}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"

log() { printf '%s backup: %s\n' "$(date '+%F %T')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

command -v mongodump >/dev/null || fail "mongodump not found (install the MongoDB Database Tools)"
command -v mongorestore >/dev/null || fail "mongorestore not found (install the MongoDB Database Tools)"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
umask 077

stamp="$(date '+%F_%H%M')"
archive="$BACKUP_DIR/daily/punchline-$stamp.gz"
tmp="$archive.part"

log "dumping to $archive"
mongodump --uri="$MONGODB_URI" --gzip --archive="$tmp" --quiet \
	--excludeCollection=games --excludeCollection=admin_sessions \
	|| { rm -f "$tmp"; fail "mongodump failed"; }

# check that the archive can be read back (nothing is written)
mongorestore --gzip --archive="$tmp" --dryRun --quiet >/dev/null 2>&1 \
	|| { rm -f "$tmp"; fail "the archive can't be read back, kept nothing"; }
mv "$tmp" "$archive"
log "ok, $(du -h "$archive" | cut -f1)"

# Sunday: keep a weekly copy
if [[ "$(date +%u)" == "7" ]]; then
	cp "$archive" "$BACKUP_DIR/weekly/"
fi

# rotation: newest first, delete beyond the limits
prune() {
	local dir="$1" keep="$2" files old i
	shopt -s nullglob
	files=("$dir"/punchline-*.gz)
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

# optional off-site copy (a backup kept only on the VPS is lost with the VPS)
if [[ -n "$REMOTE" ]]; then
	command -v rclone >/dev/null || fail "BACKUP_RCLONE_REMOTE is set but rclone is not installed"
	log "copying to $REMOTE"
	rclone copy "$BACKUP_DIR" "$REMOTE" --include "punchline-*.gz" --quiet || fail "off-site copy failed"
	log "off-site copy ok"
fi
