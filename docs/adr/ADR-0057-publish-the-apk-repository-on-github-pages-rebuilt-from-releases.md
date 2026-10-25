# ADR-0057. Publish the apk repository on GitHub Pages, rebuilt from the GitHub Releases

- Status: Proposed
- Date: 2026-10-21
- Deciders: repository owner
- Supersedes: the "package repository: a separate decision" item of [ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md); the rest of ADR-0051 stays in force

## Context and problem statement

A release is a signed apk package in a GitHub Release ([ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md)). Updating the router is still downloading the file and running `apk add` with its path: there is no repository, so `apk upgrade` does not see new versions and nothing resolves dependencies. The project is public since 2026-10-13, so the hosting condition named in ADR-0051 is met.

Facts checked on 2026-10-21:

- the router runs apk-tools 3.0.5; a feed is one line in `/etc/apk/repositories.d/*.list` with the full URL of `packages.adb`, and packages are fetched from the directory of that index as `<name>-<version>.apk`, the name the release workflow already gives them;
- `apk mkndx` in `alpine:3.23` (apk-tools 3.0.6) refuses a package whose signature is not trusted through `--keys-dir`, signs the index with `--sign-key`, and builds a valid index from zero packages; `apk verify --keys-dir` checks the index signature;
- a client with the index key in its keys directory lists and fetches the packages; without it apk reports `UNTRUSTED signature` and sees no packages;
- Pages is not enabled on the repository; GitHub Pages serves a site of at most 1 GB over HTTPS without a token.

Constraints: one signing key pair exists (ADR-0051), and the router already trusts its public key; the `release` workflow publishes with `GITHUB_TOKEN`, whose events do not start other workflows; every published version so far is a pre-release, and apk orders `0.1.0_rc5` below `0.1.0`.

Out of scope: the `sing-box-extended` dependency, which is signed by the fork and not by the project key; pruning old packages; other architectures; automatic updates on the router.

## Decision drivers

1. `apk update && apk upgrade metaboxd` on the router installs the newest release.
2. The index is signed with the project key the router already trusts; a package or index signed by another key is rejected.
3. Pre-releases reach a router that opted in without becoming the default for everyone.
4. The repository is reproducible from the releases, with no state that only the workflow holds.
5. No new secret, dependency or build step on the developer's machine.

## Considered options

1. **GitHub Pages site rebuilt from every GitHub Release by a workflow.** A workflow downloads the `.apk` of every release, builds two indexes, `testing` with every release and `stable` with releases that are not pre-releases, signs them with the `APK_SIGN_KEY` secret and deploys the site through the Pages artifact actions. The release workflow calls it as a job; it also runs by hand. Advantages: one permanent URL per channel, the releases stay the only source of packages, a rerun gives the same site, no branch grows with binaries. Drawbacks: the site is public and limited to 1 GB, so about ninety releases with a package in both channels; the workflow downloads every release each time; Pages has to be enabled once by the owner. **Chosen.**
2. **Release assets as the repository.** An index uploaded next to the package of each release. Advantages: nothing to enable, nothing to deploy. Drawbacks: the directory of the index is `releases/download/<tag>/`, so the feed URL changes with every tag and `apk upgrade` never sees a newer release; fails driver 1. **Rejected.**
3. **A `gh-pages` branch with the packages and the index committed.** The workflow commits the new package and the regenerated index. Advantages: the site is in git, a deploy is a push. Drawbacks: every package stays in the branch history, about 5.5 MB per release, and a damaged branch has to be repaired by hand; the branch becomes a second source of packages beside the releases, against driver 4. **Rejected.**
4. **Keep installing by file.** No repository; the owner downloads each release. Fails driver 1 and leaves the dependency unresolved. **Rejected.**

## Decision outcome

- The [`apk repository`](../../.github/workflows/apk-repo.yml) workflow runs on `workflow_dispatch` and `workflow_call`. The [`release`](../../.github/workflows/release.yml) workflow calls it in a job that needs `release`, with `secrets: inherit` and the permissions `contents: read`, `pages: write`, `id-token: write`.
- The job downloads the `.apk` assets of every non-draft release with `gh release download`: all of them into `site/apk/testing`, those of releases that are not pre-releases into `site/apk/stable`.
- Each channel gets `packages.adb` from `apk mkndx` in `alpine:3.23` with `--keys-dir` holding `keys/metabox-release.pem` and `--sign-key` set to the `APK_SIGN_KEY` secret, written to a file under `umask 077` and removed by `trap`. The index is checked with `apk verify --keys-dir` against the committed key before the deploy; a secret that does not match the committed key fails the job.
- The site is deployed with `actions/upload-pages-artifact` and `actions/deploy-pages` under the concurrency group `pages`, so two releases in a row do not race.
- The channel URLs are `https://mderkach.github.io/metabox/apk/testing/packages.adb` and `https://mderkach.github.io/metabox/apk/stable/packages.adb`. The documented router setup is the key in `/etc/apk/keys/`, one of these lines in `/etc/apk/repositories.d/metabox.list`, then `apk update` and `apk add metaboxd`.
- `stable` is published from the first run even while it is empty, so a router that connected it gets the first version without a pre-release suffix with no further change.
- Deferred: the fork package in the repository, pruning old packages, a second architecture.

## Consequences

### Positive

- A release becomes an `apk upgrade metaboxd` on the router, and apk checks the index and the package against the key it already trusts.
- Rebuilding the whole site from the releases means a failed deploy or a deleted release is repaired by a manual run, without touching the site by hand.
- Pre-releases are opt-in through the `testing` channel; `stable` carries only versions without a suffix.

### Negative

- The site is public: anyone with the URL gets pre-releases too.
- The 1 GB Pages limit with a package in both channels caps the history at about ninety releases; some day old packages have to leave the index, and no rule for that exists yet.
- Pages has to be enabled once with the "GitHub Actions" source by the owner, and the `github-pages` environment that this creates must allow deployments from `v*` tags: its default policy admits only the default branch, and the release job runs on the tag. Until both are done the called job fails and the release itself still succeeds.
- The workflow downloads every release on each run; the time grows with the number of releases.

### Neutral or deferred

- `sing-box-extended` is not in the repository: a clean router still installs the fork package by file first. Putting it into the index means re-signing a third-party package or building it from source; a separate decision.
- The index and the packages share one key, so a key rotation (ADR-0051) also re-signs the index on the next run.

## Risks and mitigations

| Risk                                                | Likelihood and impact       | Mitigation                                                                |
| --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| The secret does not match the committed public key  | Low, deploy fails           | `apk verify --keys-dir keys/` on each index before the deploy             |
| A release asset is replaced after publishing        | Low, high impact            | `apk mkndx` refuses a package whose signature is not from the project key |
| A deploy fails and the site lags behind the release | Medium, low impact          | `workflow_dispatch` rebuilds the site from the releases without a new tag |
| The site passes 1 GB                                | Low for years, deploy fails | A pruning rule is a separate change                                       |

## Compatibility, migration and rollback

Packages already installed by file are not affected: the repository publishes the same files, and `apk add metaboxd` from the repository at the same version changes nothing. Migration on the router is the one feed line and `apk update`. Rollback: remove `apk-repo.yml` and the `apk-repo` job from `release.yml`, disable Pages; installing by file keeps working as in ADR-0051, and a feed line left on the router only yields a warning from `apk update`.

## Validation

- `actionlint` over `.github/workflows/` reports nothing for `apk-repo.yml` and `release.yml`.
- The owner enables Pages and the tag rule once:

  ```sh
  gh api -X POST repos/mderkach/metabox/pages -f build_type=workflow
  gh api -X POST repos/mderkach/metabox/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
  ```

- Locally, with the two released packages and a throwaway key pair whose public key sits next to `keys/metabox-release.pem` in the keys directory: the index step of the workflow builds `stable` with zero packages and `testing` with two, `apk verify --keys-dir` prints `OK` for both; served by an HTTP server, `apk -X <url>/packages.adb fetch metaboxd` downloads `metaboxd-0.1.0_rc5-r0.apk` with the sha256 of the release asset; with the index key missing from the keys directory apk prints `UNTRUSTED signature`.
- After the first deploy, on the router: the feed line, `apk update` reports the `metabox testing` index, `apk list metaboxd` shows the released versions, `apk upgrade metaboxd` installs the newest one.

## Links

- [ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md): the release workflow and the signing key;
- [ADR-0050](./ADR-0050-version-releases-by-semver-and-derive-the-apk-version.md): apk version order of pre-releases;
- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md): delivery as an apk package;
- [`.github/workflows/apk-repo.yml`](../../.github/workflows/apk-repo.yml), [`.github/workflows/release.yml`](../../.github/workflows/release.yml);
- [`docs/Maintaining.md`](../Maintaining.md), section "Release"; installing a release: [`README.md`](../../README.md);
- [apk-tools](https://gitlab.alpinelinux.org/alpine/apk-tools): `apk mkndx`, `apk verify`, `apk-repositories(5)`;
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
