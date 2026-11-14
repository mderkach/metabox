## Why

A new user gets an empty panel and has to know the order of the first steps; the wizard walks through them.

Issue: #236.

## What Changes

- Daemon: keep a "first run finished" flag in the state directory, serve and set it over the API, and set it at start for an installation that already has a config.
- Daemon: report what the wizard has to know and nothing reports today: whether the core binary is installed, whether the platform has a dataplane, whether another service is running sing-box.
- Daemon: build a starter config with the dataplane inbounds on the ports of the UCI section `metabox.dataplane`, `route.default_mark` equal to the bypass mark, and `experimental.clash_api`; it goes through the existing apply protocol.
- Daemon: on a platform without a dataplane, refuse to remove the password and require one, so that "the password step cannot be skipped" holds outside the wizard too.
- Panel: the wizard itself with the steps core, password, MCP access, devices and first config, each skippable on the router; it reuses the "Settings" sections.
- Panel: a banner that offers to continue an unfinished wizard and an entry in "Settings" that reopens it.
- Panel: the devices step sets ACL mode `listed` with the ticked devices, offers `all` as a separate choice, goes through the AC-53 confirmation window, and only warns when another service runs sing-box.
- A decision record for the flag, the starter config and the detection of another service, as issue #236 asks.

## Capabilities

### Modified Capabilities

- `setup`: AC-78 and AC-79.

## Impact

- `apps/metaboxd`: `internal/config` (state file, starter config), `internal/httpapi` (endpoints), `internal/auth` (mandatory password), `internal/dataplane` or `internal/singbox` (detection of another service), `internal/contract` and the generated `apps/web/src/shared/api/daemon.generated.ts` (`make schema-daemon`), `package-scripts/post-upgrade` if the flag is set on upgrade there.
- `apps/web`: a new wizard slice and page, `app/ui` (banner), `pages/Settings` (reopen entry), `entities/Daemon`, i18n dictionaries en and ru, mock handlers and e2e.
- `docs/Verification.md`, `docs/adr/`, user documentation en and ru, `install.sh` closing message.

## Already built

The wizard is not started: no wizard code and no "first run finished" flag exist in `apps/web`, `apps/metaboxd`, `tools` or `.devcontainer` (search for "wizard", "first run", "onboarding" finds only two comments in `pages/Settings`). The pieces the steps can reuse exist:

- Password, MCP access and system sections that work on their own: `apps/web/src/pages/Settings`, `features/Auth/AuthPassword`, `features/Mcp/McpAccess` (AC-77).
- Core version: `singboxVersion` in the daemon status, shown in `pages/Settings/ui/SettingsSystem.tsx`.
- Dataplane model with ACL mode and sources, changed through `PUT /api/dataplane` with the confirmation window: `apps/metaboxd/internal/dataplane`, `internal/httpapi/dataplane.go`, `apps/web/src/entities/Dataplane`, `features/Device/DeviceRoute`.
- Device list for ticking: `apps/web/src/pages/Devices`, `entities/Device`.
- `experimental.clash_api` added by the daemon when the config lacks it: `clashapi.Ensure` called from `internal/apply/apply.go` with the `-clash-port` value.
- A banner slot in the layout: `apps/web/src/app/ui/DaemonBanner.tsx`.
- A daemon without a dataplane reader serves no `/api/dataplane` (`routes()` in `internal/httpapi/httpapi.go`); nothing tells the panel that this is the platform's property.

## Out of scope

- Installing or updating the core from the panel: AC-81 and AC-82, change `release-check-and-install`. The core step shows the state and, until that change lands, the command to install it.
- A second core and a choice between cores: roadmap item 1.
- A config built in the editor from scratch: AC-6, change `config-from-scratch`. The wizard writes one starter config and does not replace the editor.
- The dataplane settings block on "Settings": AC-77, change `settings-screen`, issue #235.
- Entries by task ("add a VPN from a share link"): roadmap item 16.
- Static leases and tags for devices: AC-80, change `static-leases`.

## Open questions

- The owner has not approved this proposal: it carries a criterion that was not marked as done when the criteria moved out of the product document.
- "Installation when it is missing" in the core step needs installing a package from the panel, which is AC-82 and not built. Does the wizard wait for that change, or show the install command until then?
- What does "the first config" contain besides the dataplane inbounds and `experimental.clash_api`: a `direct` outbound only, or DNS servers too? Issue #236 notes that without the DNS inbound the network loses DNS once interception is on.
- How is "another service is running sing-box" detected: a foreign sing-box process, a known init service, or nft tables that are not ours? The code has no such check.
- What makes a platform "without a dataplane" for the daemon: the absence of `uci` and `nft`, or an explicit flag? Today the only sign is that the dataplane reader is nil.
- AC-79 says the password step cannot be skipped on such a platform; the constraint in the product document also says the password cannot be removed there. No code enforces either. Is the daemon-side refusal part of this change?
- Where is the flag set for an upgraded installation: at daemon start when a config file exists, or in the package `post-upgrade` script? At start is simpler and covers a manual copy of the config.
- Who finishes the wizard: only the last step, or also "skip everything"? The flag is per installation, so one user closing the banner closes it for all.
- Does the devices step also enable the `metabox-singbox` service and start the core, or only the interception? On a clean install the service is disabled.
