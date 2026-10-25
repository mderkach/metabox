#!/usr/bin/env bash
set -euo pipefail

pinned=$(sed -n "s|^replace github.com/sagernet/sing-box => github.com/$FORK \(v[^ ]*\)\$|\1|p" tools/schemagen/go.mod)
[ -n "$pinned" ] || { echo "::error::no replace of github.com/sagernet/sing-box in tools/schemagen/go.mod"; exit 1; }
latest=$(gh api "repos/$FORK/releases/latest" --jq .tag_name)
echo "pinned: $pinned, latest: $latest"
if [ "$pinned" = "$latest" ]; then
  echo "no change: the pin is the latest release"
  exit 0
fi
if [ "$(printf '%s\n' "$pinned" "$latest" | sort -V | tail -n 1)" = "$pinned" ]; then
  echo "no change: the pin is newer than the latest release"
  exit 0
fi

refs=$(gh api "repos/$GITHUB_REPOSITORY/git/matching-refs/heads/$BRANCH" --jq '.[].ref')
if grep -Fxq "refs/heads/$BRANCH" <<< "$refs"; then
  branch=$(gh api "repos/$GITHUB_REPOSITORY/contents/tools/schemagen/go.mod?ref=$BRANCH" --jq .content | base64 -d)
  branch_pin=$(sed -n "s|^replace github.com/sagernet/sing-box => github.com/$FORK \(v[^ ]*\)\$|\1|p" <<< "$branch")
  if [ "$branch_pin" != "$latest" ]; then
    echo "::error::branch $BRANCH proposes $branch_pin, expected $latest; review and merge or remove that branch before retrying; it will not be overwritten"
    exit 1
  fi
  pr=$(gh pr list --repo "$GITHUB_REPOSITORY" --base main --head "$BRANCH" --state open --json url --jq '.[].url')
  if [ -n "$pr" ]; then
    echo "no change: branch $BRANCH already proposes $latest in $pr"
    exit 0
  fi
  if [ "${DRY_RUN:-false}" = true ]; then
    echo "dry run: would recover the missing PR for $BRANCH at $latest"
    exit 0
  fi
  if [ "${FORK_BUMP_TOKEN_AVAILABLE:-false}" != true ]; then
    echo "::error::branch $BRANCH has no PR; FORK_BUMP_TOKEN is required to open it and trigger CI; supply that credential or open the PR manually, then retry"
    exit 1
  fi
  title="build(schema): bump sing-box-extended to $latest"
  body="$RUNNER_TEMP/fork-recovery.md"
  {
    printf 'Recover the missing schema bump PR from `%s`.\n\n' "$BRANCH"
    printf -- '- pinned: `%s`\n- latest: `%s`\n' "$pinned" "$latest"
    printf -- '- fork diff: https://github.com/%s/compare/%s...%s\n\n' "$FORK" "$pinned" "$latest"
    printf 'The existing branch is unchanged. Review its schema and MCP field-reference diff before merging.\n'
  } > "$body"
  if ! gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$BRANCH" --title "$title" --body-file "$body"; then
    echo "::error::could not recover the PR for $BRANCH; verify FORK_BUMP_TOKEN contents/pull-requests write access and retry; the branch is unchanged"
    exit 1
  fi
  exit 0
fi

if [ "${DRY_RUN:-false}" != true ] && [ "${FORK_BUMP_TOKEN_AVAILABLE:-false}" != true ]; then
  echo "::error::FORK_BUMP_TOKEN is required to push the bump and open a PR that triggers CI; supply that credential or run dry_run"
  exit 1
fi
{
  echo "changed=true"
  echo "pinned=$pinned"
  echo "latest=$latest"
} >> "$GITHUB_OUTPUT"
