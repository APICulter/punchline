#!/usr/bin/env bash
# Punchline - fetch the backups FROM the VPS, run on ANOTHER machine (home NAS, second server…).
#
# Why: the VPS holds no credential for this machine, so even an attacker with root on the VPS
# can't delete or encrypt these copies. The VPS only lets this machine READ its backup folder.
#
# One-time setup
#   On this machine:  ssh-keygen -t ed25519 -f ~/.ssh/punchline_backup -N "" -C punchline-backup-pull
#   On the VPS (as root), allow that key to read the backups and nothing else:
#     apt install rsync
#     mkdir -p /home/punchline/.ssh
#     echo 'command="/usr/bin/rrsync -ro /var/backups/punchline/",restrict ssh-ed25519 AAAA… punchline-backup-pull' \
#       >> /home/punchline/.ssh/authorized_keys
#     chown -R punchline: /home/punchline/.ssh && chmod 700 /home/punchline/.ssh && chmod 600 /home/punchline/.ssh/authorized_keys
#     (rrsync ships with rsync; on older systems: /usr/share/doc/rsync/scripts/rrsync)
#   Then on this machine, daily at 6:00 (after the 4:30 backup):  crontab -e
#     0 6 * * * /path/to/backup-pull.sh punchline@vps.example.com ~/punchline-backups >> ~/punchline-backup-pull.log 2>&1
#
# Usage: backup-pull.sh USER@HOST DEST_DIR [KEEP_DAYS]
#   KEEP_DAYS: days of archives kept here (default 90). Older ones are deleted HERE only.
set -euo pipefail

SOURCE="${1:?usage: backup-pull.sh USER@HOST DEST_DIR [KEEP_DAYS]}"
DEST="${2:?usage: backup-pull.sh USER@HOST DEST_DIR [KEEP_DAYS]}"
KEEP_DAYS="${3:-90}"
KEY="${PUNCHLINE_PULL_KEY:-$HOME/.ssh/punchline_backup}"

log() { printf '%s backup-pull: %s\n' "$(date '+%F %T')" "$*"; }

[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || { log "KEEP_DAYS must be a number"; exit 1; }
command -v rsync >/dev/null || { log "rsync is not installed"; exit 1; }
mkdir -p "$DEST"
chmod 700 "$DEST"

# --ignore-existing: a file already here is never replaced, even if the VPS version changed
# (an attacker can't overwrite a good archive with a bad one); nothing is ever deleted here
# because it disappeared from the VPS.
log "fetching from $SOURCE"
rsync -a --ignore-existing --include='*/' --include='punchline-*.gz' --include='punchline-*.gz.age' --exclude='*' \
	-e "ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=yes" \
	"$SOURCE:" "$DEST/"

newest="$(find "$DEST" -type f -name 'punchline-*' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
if [[ -z "$newest" ]]; then
	log "ERROR: no backup here at all"
	exit 1
fi
# alert if the newest archive is older than 2 days (the VPS stopped making backups)
if [[ -n "$(find "$newest" -mtime +2)" ]]; then
	log "ERROR: newest backup is older than 2 days: $(basename "$newest")"
	exit 1
fi
log "ok, newest: $(basename "$newest")"

# local retention only
find "$DEST" -type f -name 'punchline-*' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/deleted /' || true
