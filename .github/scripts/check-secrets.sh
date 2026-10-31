#!/usr/bin/env bash
# CI: fail when a secret-looking file or value is committed.
#   - files that must never be in git (.env, private keys, server env files...)
#   - config.properties / config.properties.example: premiumCode, adminPasswordHash and
#     anthropicApiKey must be empty (premiumCode may be the "change-me" placeholder), and
#     databaseUrl must not contain a password
#   - tracked text content: private keys, Anthropic / GitHub / AWS keys, real scrypt admin hashes,
#     MongoDB URIs with a password
# Run from the repository root: .github/scripts/check-secrets.sh
set -euo pipefail

errors=0
fail() { printf '::error file=%s::%s\n' "$1" "$2"; errors=$((errors + 1)); }

# ---------------------------------------------------------------- forbidden files
while IFS= read -r file; do
	base="${file##*/}"
	case "$base" in
		.env.example|*.env.example|*.example) continue ;;
	esac
	case "$base" in
		.env|.env.*|*.pem|*.key|*.p12|*.pfx|id_rsa*|id_ecdsa*|id_ed25519*|*.keystore|mongodb-admin.env|punchline.env)
			fail "$file" "secret-looking file is committed: remove it (git rm --cached) and add it to .gitignore" ;;
	esac
	[[ "$file" == db/env ]] && fail "$file" "db/env must not be committed"
done < <(git ls-files)

# ---------------------------------------------------------------- config.properties values
check_properties() {
	local file="$1" key value
	while IFS= read -r line; do
		[[ "$line" =~ ^[[:space:]]*([A-Za-z]+)[[:space:]]*[=:][[:space:]]*(.*)$ ]] || continue
		key="${BASH_REMATCH[1]}"
		value="${BASH_REMATCH[2]%"${BASH_REMATCH[2]##*[![:space:]]}"}"
		case "$key" in
			premiumCode)
				[[ -z "$value" || "$value" == change-me ]] || fail "$file" "premiumCode has a value: leave it empty (the code is managed in the admin panel)" ;;
			adminPasswordHash|anthropicApiKey)
				[[ -z "$value" ]] || fail "$file" "$key has a value: use the environment (/etc/punchline/punchline.env) instead" ;;
			databaseUrl)
				[[ ! "$value" =~ ://[^/@]+:[^/@]+@ ]] || fail "$file" "databaseUrl contains a password: use MONGODB_URI in the environment" ;;
		esac
	done < <(git show ":$file")
}
for f in config.properties config.properties.example; do
	if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
		check_properties "$f"
	fi
done

# ---------------------------------------------------------------- secret-looking content
# (git grep -I skips binary files; package-lock.json only has integrity hashes)
# shellcheck disable=SC2016 # literal $ in the regular expressions
patterns=(
	'-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
	'sk-ant-[A-Za-z0-9_-]{20,}'
	'gh[pousr]_[A-Za-z0-9]{36,}'
	'github_pat_[A-Za-z0-9_]{40,}'
	'AKIA[0-9A-Z]{16}'
	'scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9+/=_-]{16,}\$[A-Za-z0-9+/=_-]{32,}'
	# (a password starting with $ ( [ { < is a placeholder or a shell variable, not a secret)
	'mongodb(\+srv)?://[^:/@[:space:]"'"'"'<>]+:[^@/[:space:]"'"'"'<>.$([{][^@/[:space:]"'"'"'<>]{5,}@'
)
for pattern in "${patterns[@]}"; do
	while IFS= read -r hit; do
		[[ -n "$hit" ]] || continue
		fail "${hit%%:*}" "secret-looking value (pattern: $pattern) in ${hit%%:*}"
	done < <(git grep -I -l -E -e "$pattern" -- . ':!package-lock.json' ':!.github/scripts/check-secrets.sh' || true)
done

if ((errors)); then
	echo "check-secrets: $errors problem(s) found" >&2
	exit 1
fi
echo "check-secrets: ok ($(git ls-files | wc -l) tracked files)"
