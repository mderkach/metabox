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

The [`apk repository`](../.github/workflows/apk-repo.yml) workflow then rebuilds the package repository from every release and deploys it to GitHub Pages. It also copies `install.sh` from the newest release to `https://mderkach.github.io/metabox/install.sh`. If a deploy failed, run this workflow by hand from the Actions tab; no new tag is needed.

The repository has two channels. `testing` has every release. `stable` has only versions without a pre-release suffix.

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

## sing-box-extended updates

The config schema is generated from the sing-box-extended version pinned in `tools/schemagen/go.mod`.

The [`fork release watch`](../.github/workflows/fork-release-watch.yml) workflow runs daily and by hand (`dry_run` prints the diff and pushes nothing). When a new sing-box-extended release appears, it updates the pin, regenerates the schema with `make schema` and opens a PR from the `build/bump-sing-box-extended` branch. It never overwrites an existing branch with another version: review and merge or delete that branch first.

The workflow needs the `FORK_BUMP_TOKEN` secret, a token with write access to `contents` and `pull requests`. A PR opened with the default `GITHUB_TOKEN` does not trigger CI, so the required checks would never run.

The workflow logic is tested offline by `bash .github/scripts/fork-release-check.test.sh`, which CI also runs.

### The version installed on routers

The workflow does not change the version installed on routers and on the test bench: that follows the build tested on a real router. [`install.sh`](../install.sh) pins it in `SINGBOX_VERSION` and `SINGBOX_SHA256`, and checks the downloaded package against that hash. To move to a new version, change in one commit:

- `SINGBOX_VERSION` and `SINGBOX_SHA256` in `install.sh`;
- `SINGBOX_VERSION` in `.devcontainer/target/Dockerfile` and `.devcontainer/docker-compose.yml`;
- the tested version in the README and the examples in `docs/Development.md`.

The sha256 is the `digest` of the release asset:

```sh
gh api repos/shtorm-7/sing-box-extended/releases/tags/v<version> --jq '.assets[] | select(.name | endswith("openwrt_aarch64_cortex-a53.apk")) | .digest'
```

The install script decision: [ADR-0058](./adr/ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md).
