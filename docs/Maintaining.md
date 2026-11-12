**English** · [Русский](./Maintaining.ru.md)

# Maintaining

Tasks that need owner access to the repository: releases, the signing key, GitHub Pages, branch rules, sing-box-extended updates. Build and the test bench: [`Development.md`](./Development.md).

## Release

A release is a `v*` tag on a commit in `main`.

1. Open a PR that changes [`VERSION`](../VERSION) and the version in `apps/web/package.json`.
2. After the merge, tag the merge commit:

   ```sh
   git switch main && git pull --ff-only
   git tag v$(cat VERSION)
   git push origin v$(cat VERSION)
   ```

The [`release`](../.github/workflows/release.yml) workflow then:

- checks that the tag equals `v` plus `VERSION`, and that `apps/web/package.json` has the same version;
- checks that the latest `checks` run of CI for the tagged commit passed;
- builds the package for `aarch64_cortex-a53`, signed with the `APK_SIGN_KEY` secret, and checks the signature against `keys/metabox-release.pem`;
- publishes a GitHub Release with the package, its sha256 and the public key. A version with a pre-release suffix becomes a prerelease.

Publication of one tag runs one at a time. Before creating the release, the workflow saves the four verified public files as one immutable Actions artifact, named by the tag and the full commit, with a SHA256 manifest bound to the repository and the run ([ADR-0068](./adr/ADR-0068-persist-the-verified-release-bundle-before-publication.md)). The signing key is not in the artifact. The artifact is kept for 90 days, within the repository policy.

The artifact is not a reliable recovery source: on rc.10 ([run 41328436212](https://github.com/mderkach/metabox/actions/runs/41328436212)) the artifact saved by attempt 2 was gone when attempt 3 started, so the re-run stopped with "original verified publication bundle is unavailable". GitHub does not document artifacts across run attempts; the proposed replacement is [ADR-0074](./adr/ADR-0074-keep-the-release-bundle-in-the-draft-release.md).

If publication fails, check the artifacts of the original run first (`gh api repos/<owner>/<repo>/actions/runs/<run id>/artifacts`). If the bundle is there, re-run the original workflow run: it restores the saved files, skips the build and signing, and checks the package signature again. If it is not, the re-run fails on purpose and a draft for the tag stays: the owner deletes that draft by hand, then re-runs; the workflow builds and signs a new package. Do not start a new run for the same tag while the draft exists. Publication starts with a draft on the tagged commit, uploads only the missing assets, downloads and compares all four files, then publishes the draft; the package repository skips drafts. The workflow stops without replacing assets when the original artifact is missing or expired, the commit differs, an asset is unexpected or differs, or the release is already published.

Publication regression tests, including a retry from a clean workspace, mock GitHub responses: `python3 .github/tests/test_release_publish.py`.

The [`apk repository`](../.github/workflows/apk-repo.yml) workflow then rebuilds the package repository from every release and deploys it to GitHub Pages. It also copies `install.sh` from the newest release to `https://mderkach.github.io/metabox/install.sh`. If a deploy failed, run this workflow by hand from the Actions tab; no new tag is needed.

The repository has two channels. `testing` has releases with pre-release suffixes too, `stable` has only versions without a pre-release suffix.

Retention: each channel keeps the newest 10 versions (`RETAIN` in the workflow), because a package is about 5.5 MB and Pages is limited to 1 GB. `testing` also keeps the newest stable version even if 10 newer prereleases exist, so the version `stable` points at is never dropped. Older packages leave the index and the site on the next deploy; their GitHub Releases are not touched, and raising `RETAIN` and re-running the workflow brings them back.

### GitHub Pages

Enable Pages once, with the "GitHub Actions" source. Then allow `v*` tags in the `github-pages` environment it creates, because the release deploys from a tag:

```sh
gh api -X POST repos/mderkach/metabox/pages -f build_type=workflow
gh api -X POST repos/mderkach/metabox/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
```

### Signing key

Generate it once, on your own machine, outside the repository. The private key goes only into the repository secret. It is never committed and never put on a router.

```sh
mkdir -p ~/.config/metabox keys
(umask 077 && openssl ecparam -name prime256v1 -genkey -noout -out ~/.config/metabox/release.key)
openssl ec -in ~/.config/metabox/release.key -pubout -out keys/metabox-release.pem
gh secret set APK_SIGN_KEY < ~/.config/metabox/release.key
```

`keys/metabox-release.pem` must reach `main` through a PR before the first tag, otherwise the release fails. If the private key is lost or leaked, create a new pair and replace the public key on every router.

## Branch rule

Changes reach `main` only through a PR. A repository rule blocks the merge until the `checks` and `integration` CI jobs pass. `checks` already includes `integration`; the second entry can be removed from the rule. The rule stores job names, so renaming a job in `ci.yml` requires editing the rule in the same change. Otherwise the merge waits for a check that no longer exists.

## Workflow actions

Every external action in `.github/workflows/` is pinned to a commit SHA with the tag in a trailing comment (`uses: actions/checkout@<sha> # v5`). A tag can be moved; a SHA cannot. To update one, resolve the new tag with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (for an annotated tag, `type` is `tag`: dereference it with `git/tags/<sha>`), then change the SHA and the comment together.

## sing-box-extended updates

The config schema is generated from the sing-box-extended version pinned in `tools/schemagen/go.mod`.

The [`fork release watch`](../.github/workflows/fork-release-watch.yml) workflow runs daily and by hand (`dry_run` prints the diff and pushes nothing). When a new sing-box-extended release appears, it updates the pin, regenerates the schema with `make schema` and opens a PR from the `build/bump-sing-box-extended` branch. It never overwrites an existing branch with another version: review and merge or delete that branch first. If the branch holds the latest version but has no PR (for example, the PR step failed after the push), the next run opens the PR from that branch, or fails when it cannot; it does not finish green without a PR.

The workflow needs the `FORK_BUMP_TOKEN` secret, a token with write access to `contents` and `pull requests`. A PR opened with the default `GITHUB_TOKEN` does not trigger CI, so the required checks would never run. Without the secret the workflow fails before pushing anything, except in `dry_run`. The default token also cannot open PRs unless the repository setting "Allow GitHub Actions to create and approve pull requests" is on (Settings, Actions, General); that is how the first run failed with "GitHub Actions is not permitted to create or approve pull requests". The secret and the setting are owner steps.

The workflow logic is tested offline by `bash .github/scripts/fork-release-check.test.sh`, which CI also runs.

### The version installed on routers

The workflow does not change the version installed on routers and on the test bench: that follows the build tested on a real router. [`install.sh`](../install.sh) pins it in `SINGBOX_VERSION` and `SINGBOX_SHA256`, and checks the downloaded package against that hash. To move to a new version, change in one commit:

- `sing-box-extended.sha256`: the file name carries the version, the line the hash; the test bench reads this file;
- `SINGBOX_VERSION` and `SINGBOX_SHA256` in `install.sh` (`make singbox-pin-check` compares them with the file);
- the tested version in the README and the examples in `docs/Development.md`.

The file has a line for `aarch64_cortex-a53` (the router), `aarch64_generic` (the public-rootfs bench) and `x86_64` (the CI bench). The sha256 is the `digest` of the release asset; use the other arch suffix for the other lines:

```sh
gh api repos/shtorm-7/sing-box-extended/releases/tags/v<version> --jq '.assets[] | select(.name | endswith("openwrt_aarch64_cortex-a53.apk")) | .digest'
```

The install script decision: [ADR-0058](./adr/ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md).
