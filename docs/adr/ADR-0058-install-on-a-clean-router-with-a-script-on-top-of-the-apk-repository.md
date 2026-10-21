# ADR-0058. Install on a clean router with a script on top of the apk repository

- Status: Proposed
- Date: 2026-10-21
- Deciders: repository owner

## Context and problem statement

Releases are published as a signed apk repository on GitHub Pages ([ADR-0057](./ADR-0057-publish-the-apk-repository-on-github-pages-rebuilt-from-releases.md)). On a router that already has `sing-box-extended` the install is four commands: the project key into `/etc/apk/keys/`, the feed line into `/etc/apk/repositories.d/`, `apk update`, `apk add metaboxd`. On a clean router `apk add metaboxd` fails: the package declares `depends:sing-box-extended`, and the fork package is in no feed the router knows. The owner installs it by hand from the fork release, then disables the fork's own `sing-box` service, because sing-box is started by `metabox-singbox`. The README describes these steps in prose; nothing does them.

Facts checked on 2026-10-21:

- the fork release `v1.14.1-extended-2.7.2` has `sing-box-extended_1.14.1-extended-2.7.2_openwrt_aarch64_cortex-a53.apk`, 33 MB. The release has no checksum file; the sha256 is only in the asset `digest` field of the GitHub API. The package is not signed with the project key, so apk installs it only with `--allow-untrusted`;
- the fork package ships its own `sing-box` service. The test bench image removes `/etc/rc.d/S99sing-box` after installing it ([`.devcontainer/target/Dockerfile`](../../.devcontainer/target/Dockerfile)); in a container from the device image the install left no such link. Whether the install enables the service on the router is not checked;
- the router has `wget` (`uclient-fetch`), `ca-bundle` and `sha256sum`, and no `curl`;
- b4, which runs on the same router, is installed by `curl … install.sh | sh`: the script downloads a tarball from the GitHub release, checks its `.sha256` and writes the binary and an init script itself, outside any package manager ([b4 README](https://github.com/DanielLavrushin/b4#installation)). b4 needs this because it supports firmware without apk (Merlin, Keenetic, MikroTik); metabox targets OpenWrt with apk only ([ADR-0042](./ADR-0042-target-the-bpi-r4-pro-and-build-for-aarch64-only.md)).

Out of scope: an install wizard in the panel, other architectures, putting the fork package into the project feed, starting the services or enabling interception, updates (they stay `apk upgrade metaboxd`).

## Decision drivers

1. A clean OpenWrt router on `aarch64_cortex-a53` gets the panel with one command.
2. Packages stay under apk: `apk upgrade` sees new releases, conffiles survive upgrades, `apk del` removes the files.
3. Nothing unverified gets installed: the project package is checked by the project key, the fork package by a pinned sha256.
4. The script changes nothing the owner set up already: an installed fork, a running sing-box service, an existing config.
5. No new secret and no new build step; the script runs with what OpenWrt ships.

## Considered options

1. **A POSIX `install.sh` that prepares apk and installs the package.** It checks the platform, puts the key and the feed line, installs the fork package from its release after checking a sha256 pinned in the script, disables the fork's service if the script installed it, then runs `apk add metaboxd`. Served from the apk repository site. Advantages: one command; the project package is still installed and updated by apk with signature checks; no re-signing of a third-party binary. Drawbacks: the first step is `wget … | sh`, which nothing signs; the fork version and sha256 are a pin to keep in step with the test bench; the fork package stays outside the feed, so `apk upgrade` does not update it. **Chosen.**
2. **A b4-style installer without apk.** The script downloads the daemon binary and writes the init scripts and configs itself. Advantages: works on firmware without apk. Drawbacks: duplicates what the package does (procd services, conffiles, the `.apk-new` handling of `/etc/config/metabox`), loses the signature check, `apk upgrade` does not see the panel; the platforms it would add are outside ADR-0042. **Rejected.**
3. **Put the fork package into the project feed, re-signed with the project key.** `apk add metaboxd` then resolves the dependency by itself, and `apk upgrade` updates the fork too. Advantages: no script; updates of both packages through apk. Drawbacks: the project key starts vouching for a 33 MB binary the project does not build; the apk-repo workflow has to download, check and re-sign the fork on every run; the feed grows by 33 MB per fork version against the 1 GB Pages limit. A separate decision. **Rejected for now.**
4. **Keep the manual steps in the README.** Advantages: nothing to maintain. Drawbacks: fails driver 1; a new user without SSH routine does not reach the panel. **Rejected.**

## Decision outcome

- [`install.sh`](../../install.sh) at the repository root, POSIX `sh`, `set -eu`, runs as root on the router. It uses only `wget`, `sha256sum`, `apk` and the init scripts.
- Checks before any change: user id 0, `/etc/openwrt_release` present, `apk` present, `/etc/apk/arch` equal to `aarch64_cortex-a53`. A failed check stops the script with a message and no change.
- The project key goes to `/etc/apk/keys/metabox-release.pem` from `keys/metabox-release.pem` on the `main` branch. An existing file with other content stops the script: replacing a trusted key is the owner's call.
- The feed line goes to `/etc/apk/repositories.d/metabox.list`. The channel is `testing` by default and `stable` with `--channel stable`.
- If `sing-box-extended` is not installed, the script downloads the fork package of the version pinned in the script, compares its sha256 with the pinned one, installs it with `apk add --allow-untrusted` and disables and stops its `sing-box` service. A package with another sha256 is deleted and the script stops. If the fork is installed, the script does not touch it or its service. If the official `sing-box` package is installed instead, the script stops: the fork package declares `provides: sing-box` and apk replaces the official package with it, which would swap the binary under whatever runs it now.
- Then `apk update` and `apk add metaboxd`. The script does not start or enable the services: the package does not do it either, and the next step needs a sing-box config.
- The pinned fork version is the same as `SINGBOX_VERSION` in `.devcontainer/target/Dockerfile`; a fork upgrade changes both in one commit.
- The release workflow attaches `install.sh` to the release, and the apk-repo workflow puts the `install.sh` of the newest release that has one at the site root; until a release carries it, the site gets the copy of the ref the workflow runs on. The documented command is `wget -qO- https://mderkach.github.io/metabox/install.sh | sh`.

## Consequences

### Positive

- A clean router gets the panel with one command, and every later update is `apk upgrade metaboxd`.
- The fork package is checked against a hash pinned in the repository instead of being trusted by URL.
- The script is versioned with the releases: the copy on the site is the one of the newest release, not the head of `main`.

### Negative

- `wget … | sh` is trust on first use: the script is checked by nothing but TLS to GitHub Pages.
- The fork version lives in four places: the generator `go.mod`, the test bench Dockerfile, `docker-compose.yml` and `install.sh`.
- The fork package is outside the feed: `apk upgrade` does not update it, and a fork release means a new metabox release with a new pin.
- The key comes from `main`, the script from the newest release: a key rotation has to reach `main` before the next release.

### Neutral or deferred

- Re-signing the fork into the feed (option 3) and an install wizard in the panel stay separate decisions.
- Whether `/etc/apk/keys/` and `/etc/apk/repositories.d/metabox.list` survive `sysupgrade` is not checked; the router's `distfeeds.list` says it is regenerated and suggests `customfeeds.list` for own feeds.

## Risks and mitigations

| Risk                                                         | Likelihood and impact     | Mitigation                                                                                          |
| ------------------------------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------- |
| The fork release asset is replaced                           | Low, high impact          | sha256 pinned in the script; a mismatch deletes the file and stops                                  |
| The pin in the script falls behind the test bench            | Medium, the wrong fork    | one commit changes both; `grep` of the version in Validation                                        |
| A router with another sing-box setup gets its service broken | Low, loss of routing      | the script disables only a service it installed itself and stops on the official `sing-box` package |
| `/tmp` has no room for the 33 MB package                     | Low on BPI-R4 Pro, aborts | the download fails before any change to apk                                                         |

## Compatibility, migration and rollback

A router with metabox installed by hand is not affected: the script finds the fork installed, rewrites the same key and feed line and `apk add metaboxd` changes nothing. Rollback: remove `install.sh` and the two workflow steps; the manual steps of the README keep working. On the router, the script's changes are undone by `apk del metaboxd sing-box-extended` and removing the key and the feed line.

## Validation

- On a container from the device image (`make stand-base`) without metabox, with `/var/lock` and `/var/run` created as on the router: `sh install.sh` installs `sing-box-extended` and `metaboxd` from the Pages feed, `apk verify` on the fetched package is `OK`, `/etc/rc.d/` has no `S99sing-box`, `metabox-singbox` and `metaboxd` are not enabled.
- The same container run again: the script finishes without errors, leaves the fork as is and changes nothing.
- A pinned sha256 that does not match stops the script before `apk add`; nothing is installed.
- A key file with other content, an unknown channel and an installed official `sing-box` package each stop the script with a message.
- A container on `aarch64_generic` stops on the arch check without changes.
- `grep -rn 1.14.1-extended-2.7.2 install.sh .devcontainer` shows the same version in both.
- After the next release: `https://mderkach.github.io/metabox/install.sh` returns the script of that release.

## Links

- [ADR-0057](./ADR-0057-publish-the-apk-repository-on-github-pages-rebuilt-from-releases.md): the apk repository on Pages;
- [ADR-0051](./ADR-0051-publish-releases-from-a-tag-workflow-and-sign-the-apk.md): the release workflow and the signing key;
- [ADR-0042](./ADR-0042-target-the-bpi-r4-pro-and-build-for-aarch64-only.md): the target device and arch;
- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md): delivery as an apk package;
- [`install.sh`](../../install.sh), [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`.github/workflows/apk-repo.yml`](../../.github/workflows/apk-repo.yml);
- [sing-box-extended releases](https://github.com/shtorm-7/sing-box-extended/releases);
- [b4 installer](https://github.com/DanielLavrushin/b4/blob/main/install.sh).
