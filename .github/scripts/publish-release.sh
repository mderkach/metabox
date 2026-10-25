#!/usr/bin/env bash
set -euo pipefail

: "${TAG:?TAG is required}" "${PACKAGE:?PACKAGE is required}" \
  "${PUBLIC_KEY:?PUBLIC_KEY is required}" "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}" \
  "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

fail() {
  echo "::error::$*" >&2
  exit 1
}

commit=$(git rev-parse HEAD)
[ "$(git rev-parse "$TAG^{commit}")" = "$commit" ] || fail "$TAG does not point to checked-out commit $commit"
files=("dist/$PACKAGE" "dist/$PACKAGE.sha256" "$PUBLIC_KEY" install.sh)
for file in "${files[@]}"; do
  [ -s "$file" ] || fail "release asset $file is missing or empty"
done
(cd dist && sha256sum -c "$PACKAGE.sha256")

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/download"

read_release() {
  gh api --paginate --slurp "repos/$GITHUB_REPOSITORY/releases?per_page=100" > "$tmp/releases.json"
  jq --arg tag "$TAG" '[.[][] | select(.tag_name == $tag)]' "$tmp/releases.json" > "$tmp/release.json"
  [ "$(jq length "$tmp/release.json")" -le 1 ] || fail "multiple releases found for $TAG"
}

check_draft() {
  [ "$(jq '.[0].draft' "$tmp/release.json")" = true ] || fail "$TAG is already published; refusing to modify it"
  [ "$(jq -r '.[0].target_commitish' "$tmp/release.json")" = "$commit" ] || fail "draft $TAG targets a different commit; expected $commit"
  while IFS= read -r name; do
    found=false
    for file in "${files[@]}"; do
      [ "$name" != "${file##*/}" ] || found=true
    done
    [ "$found" = true ] || fail "draft $TAG has unexpected asset $name"
  done < <(jq -r '.[0].assets[].name' "$tmp/release.json")
}

verify_asset() {
  local file=$1 name=${1##*/}
  rm -f "$tmp/download/$name"
  gh release download "$TAG" --repo "$GITHUB_REPOSITORY" --pattern "$name" --dir "$tmp/download"
  cmp -s "$file" "$tmp/download/$name" || fail "draft asset $name differs from the verified build; refusing to replace it"
}

read_release
if [ "$(jq length "$tmp/release.json")" = 0 ]; then
  create_args=(--repo "$GITHUB_REPOSITORY" --draft --verify-tag --target "$commit" --generate-notes
    --notes "Verified publication bundle: https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID")
  case "$TAG" in *-*) create_args+=(--prerelease) ;; esac
  gh release create "$TAG" "${create_args[@]}"
  read_release
fi
check_draft

for file in "${files[@]}"; do
  name=${file##*/}
  if jq -e --arg name "$name" '.[0].assets | any(.name == $name)' "$tmp/release.json" > /dev/null; then
    verify_asset "$file"
  else
    gh release upload "$TAG" "$file" --repo "$GITHUB_REPOSITORY"
  fi
done

read_release
check_draft
[ "$(jq '.[0].assets | length' "$tmp/release.json")" = "${#files[@]}" ] || fail "draft $TAG has an incomplete asset set"
for file in "${files[@]}"; do verify_asset "$file"; done
gh release edit "$TAG" --repo "$GITHUB_REPOSITORY" --draft=false --verify-tag
