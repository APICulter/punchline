#!/bin/bash
# Punchline - the ONLY thing the CI SSH key can run on the VPS.
#
# Installed by deploy/setup-vps.sh as /usr/local/sbin/punchline-deploy (root:root, 0755), outside
# the git checkout: the files in /srv/punchline belong to the punchline user and change with every
# deploy, so if sudo ran a script from there, anyone able to push to main (or a compromised app
# process) could get root. sudo runs this root-owned copy, which runs the root-owned copy of
# deploy.sh in /usr/local/lib/punchline/. To update them, re-run setup-vps.sh.
#
# Chain: GitHub Actions -> `ssh deploy@vps <sha>` -> ~deploy/.ssh/authorized_keys forces
#   command="sudo -n /usr/local/sbin/punchline-deploy \"$SSH_ORIGINAL_COMMAND\"",restrict
# -> /etc/sudoers.d/punchline-deploy allows exactly this file for the deploy user
#    (with sudo >= 1.9.10, only with one argument made of 40 hex characters)
# -> this file checks the SHA again and runs deploy.sh with a clean environment.
#
# By hand: sudo punchline-deploy <40-hex sha>
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DEPLOY_SCRIPT=/usr/local/lib/punchline/deploy.sh

reject() {
	echo "punchline-deploy: refused: $1" >&2
	echo "usage: ssh deploy@<vps> <full 40-character commit SHA>" >&2
	logger -t punchline-deploy "refused request from ${SUDO_USER:-$(id -un)}: $1" 2>/dev/null || true
	exit 64
}

# the SHA comes as the single argument (the forced command passes $SSH_ORIGINAL_COMMAND quoted),
# or in SSH_ORIGINAL_COMMAND when the wrapper is used as the forced command without sudo
if (($# > 1)); then
	reject "too many arguments"
fi
request="${1-${SSH_ORIGINAL_COMMAND-}}"

# exactly 40 lowercase hex characters: no spaces, options, shell characters or short SHAs
if [[ ! "$request" =~ ^[0-9a-f]{40}$ ]]; then
	reject "not a full commit SHA: '$(printf '%s' "$request" | head -c 80 | tr -c '[:alnum:]._-' '?')'"
fi

[[ "$(id -u)" -eq 0 ]] || reject "must run as root (through sudo)"

# the script sudo will run must not be writable by anyone but root
if [[ ! -f "$DEPLOY_SCRIPT" ]] || [[ "$(stat -c '%u' "$DEPLOY_SCRIPT")" != 0 ]] \
	|| [[ -n "$(find "$DEPLOY_SCRIPT" -perm /022 2>/dev/null)" ]]; then
	echo "punchline-deploy: $DEPLOY_SCRIPT is missing or not root-owned / is writable: re-run setup-vps.sh" >&2
	exit 1
fi

logger -t punchline-deploy "deploy of $request requested by ${SUDO_USER:-$(id -un)}" 2>/dev/null || true
exec env -i PATH="$PATH" LANG=C.UTF-8 SUDO_USER="${SUDO_USER:-}" "$DEPLOY_SCRIPT" "$request"
