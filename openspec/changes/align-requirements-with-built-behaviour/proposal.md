## Why

Several requirements in `openspec/specs/` say less than, or something other than, what the built code does and its tests check. The owner decided in favour of the code: the requirement text changes, the code does not.

Issues: #329, #331, #333, #334.

## What Changes

- AC-69 (panel password): the lockout counts by network, an IPv4 /24 or an IPv6 /64, not by address; when wrong passwords come from many networks, every login is slowed down instead of locked; the list of what answers without a session is the one the code has.
- AC-74 (HTTPS): the root admits all private networks, so a LAN address change reissues only the server certificate; a new root is issued when a panel address or name falls outside it, when its files are missing or unreadable, or when it has expired. `Secure` on the session cookie follows the request coming over TLS. The owner's certificate pair applies with HTTPS on, and one path without the other stops the daemon at start.
- AC-10 (overview): the empty state of the connection summary.
- AC-18 (LAN only): the daemon starts when one of its listen addresses is not up yet.
- AC-71 (MCP token): regenerating the token and disabling MCP ask for a confirmation.
- AC-53 (dataplane apply): an ACL change that takes the administrator's own address out of interception is noted in the daemon log.
- AC-67 (migration): the switch and rollback runbook, the router-side scenario and the note on moving the ACL source list over SSH during the switch are dropped: the switch was a one-off for the owner's router, new users get `install.sh`. The package still installs disabled next to a foreign routing setup without touching it.
- Two checks that AC-74 lacked: the root file is not served with the owner's pair (`apps/metaboxd/internal/httpapi/tls_test.go`), and the `https`, `https_cert` and `https_key` options of UCI reach the daemon flags through the init script (`.github/scripts/package-smoke.sh`, CI job `package`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `access`: AC-18, AC-69, AC-74.
- `overview`: AC-10.
- `mcp`: AC-71.
- `dataplane`: AC-53.
- `setup`: AC-67.

## Impact

- `openspec/specs/access`, `overview`, `mcp`, `dataplane`, `setup`; `docs/Verification.md`.
- Tests only: `apps/metaboxd/internal/httpapi/tls_test.go`, `.github/scripts/package-smoke.sh`, and its description in `docs/Maintaining.md` and `docs/Maintaining.ru.md`. No behaviour of the daemon or the panel changes.

## Out of scope

- Implementation details, not requirements; their tests and `docs/Verification.md` rows stay: AC-35, how the sing-box process is found (by its listener) and how the outward interface is chosen (not the tunnel); AC-37, board readings keep their peaks when history points are merged; AC-68, how the diagnostics screen presents the result, settled in the redesign.
- AC-11, an automatic group gets a manual choice: removed together with the feature in #314.
- Code changes of any kind: where code and requirement disagreed, the code was kept.

## Open questions

None.
