#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/tools/schemagen"
cat > "$work/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
  'api repos/fork/core/releases/latest') printf '%s\n' "$LATEST" ;;
  'api repos/owner/repo/git/matching-refs/heads/build/bump')
    [ "${REFS_DENIED:-false}" != true ] || { echo 'HTTP 403' >&2; exit 1; }
    [ -z "${BRANCH_PIN:-}" ] || echo refs/heads/build/bump
    ;;
  'api repos/owner/repo/contents/tools/schemagen/go.mod?ref=build/bump')
    printf 'replace github.com/sagernet/sing-box => github.com/fork/core %s\n' "$BRANCH_PIN" | base64
    ;;
  'pr list')
    [ "${PR_LIST_DENIED:-false}" != true ] || { echo 'HTTP 403' >&2; exit 1; }
    printf '%s' "${PR_URL:-}"
    ;;
  'pr create')
    printf '%s\n' "$*" >> "$MUTATIONS"
    [ "${CREATE_DENIED:-false}" != true ] || { echo 'HTTP 403' >&2; exit 1; }
    grep -Fq 'The existing branch is unchanged.' "${!#}"
    echo https://github.com/owner/repo/pull/1
    ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
MOCK
cat > "$work/bin/git" <<'MOCK'
#!/usr/bin/env bash
printf 'unexpected git call: %s\n' "$*" >&2
exit 1
MOCK
chmod +x "$work/bin/gh" "$work/bin/git"

run_case() {
  local name=$1 expected=$2 message=$3 mutation_count=$4
  shift 4
  : > "$work/output"
  : > "$work/mutations"
  printf 'replace github.com/sagernet/sing-box => github.com/fork/core v1.0.0\n' > "$work/tools/schemagen/go.mod"
  local status=0
  (
    cd "$work"
    env PATH="$work/bin:$PATH" FORK=fork/core BRANCH=build/bump GITHUB_REPOSITORY=owner/repo \
      RUNNER_TEMP="$work" GITHUB_OUTPUT="$work/output" MUTATIONS="$work/mutations" \
      LATEST=v1.1.0 BRANCH_PIN= PR_URL= FORK_BUMP_TOKEN_AVAILABLE=true DRY_RUN=false \
      "$@" bash "$root/.github/scripts/fork-release-check.sh"
  ) > "$work/log" 2>&1 || status=$?
  if [ "$status" != "$expected" ] || ! grep -Fq "$message" "$work/log"; then
    echo "FAIL: $name (exit $status, expected $expected)"
    cat "$work/log"
    exit 1
  fi
  if [ "$(wc -l < "$work/mutations" | tr -d ' ')" != "$mutation_count" ]; then
    echo "FAIL: $name (unexpected mutation count)"
    cat "$work/mutations"
    exit 1
  fi
  echo "ok: $name"
}

run_case 'up-to-date pin needs no token' 0 'the pin is the latest release' 0 LATEST=v1.0.0 FORK_BUMP_TOKEN_AVAILABLE=false
run_case 'newer pin needs no token' 0 'the pin is newer' 0 LATEST=v0.9.0 FORK_BUMP_TOKEN_AVAILABLE=false
run_case 'existing PR is left alone' 0 'https://github.com/owner/repo/pull/1' 0 BRANCH_PIN=v1.1.0 PR_URL=https://github.com/owner/repo/pull/1 FORK_BUMP_TOKEN_AVAILABLE=false
run_case 'missing PR is recovered' 0 'https://github.com/owner/repo/pull/1' 1 BRANCH_PIN=v1.1.0
test ! -s "$work/output"
run_case 'denied PR creation fails actionably' 1 'verify FORK_BUMP_TOKEN' 1 BRANCH_PIN=v1.1.0 CREATE_DENIED=true
run_case 'missing recovery token fails without mutations' 1 'branch build/bump has no PR' 0 BRANCH_PIN=v1.1.0 FORK_BUMP_TOKEN_AVAILABLE=false
run_case 'recovery dry-run is readonly without token' 0 'would recover the missing PR' 0 BRANCH_PIN=v1.1.0 DRY_RUN=true FORK_BUMP_TOKEN_AVAILABLE=false
run_case 'unexpected branch version is not overwritten' 1 'it will not be overwritten' 0 BRANCH_PIN=v1.0.1
run_case 'ref API failure is not treated as missing branch' 1 'HTTP 403' 0 REFS_DENIED=true
run_case 'PR lookup failure is not treated as missing PR' 1 'HTTP 403' 0 BRANCH_PIN=v1.1.0 PR_LIST_DENIED=true
run_case 'new bump needs external token' 1 'required to push the bump' 0 FORK_BUMP_TOKEN_AVAILABLE=false
test ! -s "$work/output"
run_case 'new bump proceeds with external token' 0 'pinned: v1.0.0, latest: v1.1.0' 0
grep -Fxq 'changed=true' "$work/output"
grep -Fxq 'latest=v1.1.0' "$work/output"
run_case 'new bump dry-run needs no external token' 0 'pinned: v1.0.0, latest: v1.1.0' 0 DRY_RUN=true FORK_BUMP_TOKEN_AVAILABLE=false
grep -Fxq 'changed=true' "$work/output"
echo 'fork release check: 13 scenarios passed'
