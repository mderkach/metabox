## Why

Updating the panel and the core takes SSH today; the owner has to see a new release and install it from the panel with a rollback.

Issue: none yet.

## What Changes

Neither criterion has code beyond showing the installed versions. To build:

- AC-81, daemon: a release checker for `metaboxd` (project feed or GitHub releases) and for the installed core (the sing-box-extended GitHub releases), run once a day and on request; off by default; a setting for the route of the request, direct or through the selected node; the state (installed, latest, checked at, error) kept between restarts.
- AC-81, panel: the "System" section of "Settings" shows installed and latest side by side, the switch that turns the check on, the route choice and a "check now" button.
- AC-82, daemon: install `metaboxd` from the project feed with `apk`; download to a temporary directory.
- AC-82, daemon: install the sing-box-extended package from its GitHub release, checked against the published hash, as a new kind of Apply transaction: backup of the previous binary, install, restart, healthcheck, confirmation window, rollback to the previous binary; replay of an unfinished transaction on daemon start.
- AC-82, panel: the install actions, the confirmation window for the core, and survival of the daemon's own restart: the session and the open screen stay.

## Capabilities

### Modified Capabilities

- `setup`: AC-81 and AC-82.

## Impact

- `apps/metaboxd`: a new package for the release check and the install; `internal/apply` (a transaction kind for the binary, its replay), `internal/httpapi`, `internal/contract`, `internal/locale`, `main.go` (flags, state store); the package scripts in `apps/metaboxd/package` if the daemon has to restart itself through procd.
- `apps/web`: `pages/Settings` (`SettingsSystem.tsx`), `entities/Daemon`, a new feature for the update; `shared/api/daemon.generated.ts` through `make schema-daemon`.
- `.devcontainer`: a bench scenario for the core install with a failing healthcheck.
- `docs/Verification.md`, user documentation, `install.sh` text ("Updates: apk update && apk upgrade metaboxd").
- A decision record: where the hash of a core release comes from and how the daemon replaces its own package.

## Already built

Nothing of the check or the install. Pieces the change stands on:

- Installed versions are known and shown: `Status.Version` and `Core.Version` in `apps/metaboxd/internal/contract/contract.go`, rows "panel" and "core" in `apps/web/src/pages/Settings/ui/SettingsSystem.tsx`. No "latest" value exists anywhere.
- A daily checker with retry, a saved cache and a GitHub client exists for the rule set catalog (`apps/metaboxd/internal/ruleset/updater.go`, `github.go`); it has no off switch in the panel (only the flag `-rule-set-refresh 0`) and no route choice.
- The Apply protocol (backup, write, restart, healthcheck, confirmation window, rollback, replay on start) covers the config and the dataplane model only: `apps/metaboxd/internal/apply`. It has no step that replaces a binary.
- Sessions survive a daemon restart: `apps/metaboxd/internal/auth/auth.go` (session file), tests `TestFirstPasswordOpensASessionAndBothSurviveRestart`, `TestLogoutAndChangeSurviveRestart`, `TestSessionAddressAndAgeSurviveRestart`. The panel shows a banner while the daemon is unreachable (`apps/web/src/app/ui/DaemonBanner.tsx`); no test covers a daemon that comes back as another build.
- The feed and the pinned core hash exist for the first install only: `install.sh` (apk feed, `SINGBOX_SHA256`), `sing-box-extended.sha256` in the repository root, `.github/workflows/apk-repo.yml`.

## Out of scope

- Feed sources of other cores: roadmap item 1, named in AC-82.
- Updating the embedded schema when the core is newer than the panel: the existing binary-versus-schema check stays as it is.
- Release pipeline debts: issue #257 (the aarch64 package is not run before publishing, the feed trusts one key), issue #230 (`install.sh` on a real router, feed survival across sysupgrade).
- AC-77, the "Settings" screen itself: change `settings-screen`.
- Automatic installation without the user.

## Open questions

- No issue names this work; open one when it is scheduled.
- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- "Checked by the published hash": the fork publishes no hash list that the daemon could trust on its own; today the hash is pinned in this repository (`sing-box-extended.sha256`) for one version. Does the daemon take hashes from a file the project publishes with each `metaboxd` release (then a core newer than the pin cannot be installed), or from the fork's release?
- Which core release is "latest": the newest fork release, or the newest one the installed panel schema was built for? A newer core than the schema makes the editor lag behind the binary.
- Where the `metaboxd` latest version comes from: the apk feed index of the channel the router is subscribed to (`stable` or `testing`), or GitHub releases?
- "Through the selected node": selected where? There is no setting that names a node for daemon requests; the rule set catalog check always goes direct. One shared setting for both checks?
- `metaboxd` updates itself with `apk upgrade`, which restarts the service that runs the command. Who finishes the transaction and reports a failed upgrade: a detached helper, or procd?
- Is there a rollback for `metaboxd` itself? AC-82 names a rollback for the core only.
- "The open screen is kept": does an unsaved draft of the config survive the reload of the panel assets after the update, or only the route?
- Free space: a core package is tens of megabytes; `/tmp` is RAM. Is a refusal on low memory part of the criterion?
