# ADR-0041. Do without authentication in v1 and protect the panel by the network and the `Origin`/`Host` check

- Status: Accepted. The decision was made on 2026-08-30 in section A.6 of [`../PRD.md`](../PRD.md) and moved here without changes in substance
- Date: 2026-08-30
- Deciders: repository owner
- Supersedes: section A.6 of [`../PRD.md`](../PRD.md)

## Context and problem statement

The panel controls routing for the router's whole network. It has to be decided who is allowed into it in v1.

The owner's answer in interview `metabox-di-001`, Round 8: "No authentication in v1." This is the accepted risk R-1: any device in the LAN (guest Wi-Fi, IoT, a compromised client) gets full control over routing and can silently send traffic through its own outbound. Separately there is CSRF: a malicious web page in the owner's browser can send requests to the panel address without any password.

In scope: the v1 access model and mandatory mitigations. Out of scope: HTTPS and external access, a roadmap item after v1.

## Decision drivers

- The size of the v1 core: authentication is not part of the M1 scenarios.
- The panel is not reachable from outside (AC-18).
- A third-party page in the owner's browser cannot change the config (AC-19).
- The risk is named to the owner explicitly rather than hidden.

## Considered options

1. **Login, password and sessions in v1.** Closes R-1, but adds credential storage, sessions and their recovery on password loss to the core. Deferred by the owner: authentication is the first roadmap item after v1. **Rejected for v1.**
2. **No authentication and no mitigations.** The panel is open to CSRF from third-party pages and to anyone who reaches the address. **Rejected.**
3. **No authentication, with mandatory mitigations.** **Chosen.**

## Decision outcome

**There is no authentication in v1.** Mandatory mitigations:

- bind strictly to the LAN interface, **not** to `0.0.0.0`;
- check the `Origin`/`Host` headers on all mutating requests;
- an explicit warning in the README;
- authentication is the first roadmap item after v1.

### Scope and boundaries

How the mitigations are implemented today:

- The daemon listens on the addresses of the networks from `listen_interface` in `/etc/config/metabox`, by default only `lan`; `0.0.0.0` does not appear in the default value. AC-18 extended "LAN interface" to all local networks, including guest ones; which of them are open is decided by the owner on the device ([HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md), section "Server and timeouts").
- On mutating requests the host from `Origin` has to match `Host`; a request without `Origin` is rejected. The `Host` check is on all requests, as protection against DNS rebinding. Relaxation is possible only with the `-allowed-origin` flag ([HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md), section "Origin check").
- The warning is in the second paragraph of [`README.md`](../../README.md).
- The service does not start by itself when the package is installed ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)).

## Consequences

### Positive

- The v1 core is not spent on user accounts; CSRF and DNS rebinding are closed without them.

### Negative

- Any device in the networks open to the panel controls routing for the whole network. A guest network in `listen_interface` extends this circle to guests.
- The panel does not answer on the router's DNS name until the name is allowed with the `-allowed-origin` flag.

### Neutral or deferred

- Authentication, HTTPS and secure external access are on the roadmap after v1.

## Risks and mitigations

| Risk                                                               | Probability and impact | Mitigation                                                                     |
| ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------ |
| A device in the LAN changes routing (R-1)                          | high impact (R-1)      | access only from `listen_interface` networks, a warning in the README          |
| A third-party page sends a mutating request (CSRF)                 | high impact            | `Origin`/`Host` check, a request without `Origin` is rejected, no CORS headers |
| The attacker's domain is pointed at the router address (rebinding) | high impact            | `Host` check on all requests                                                   |

## Compatibility, migration and rollback

Not applicable: the decision has been in effect since the start of the project and is moved from the PRD without changes in substance. Introducing authentication is a separate ADR.

## Validation

- AC-19: the `internal/httpapi` tests reject a mutating request with a foreign `Origin`/`Host`.
- AC-18: `make reach-check`: the panel answers from the test bench's local networks and does not answer from the external one.

## Links

- [`../PRD.md`](../PRD.md): AC-18, AC-19, risk R-1, section 9, the roadmap after v1, section A.6 (superseded by this ADR);
- [HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md): the origin check and listen addresses;
- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md), [ADR-0023](./ADR-0023-build-the-bench-from-the-device-firmware.md): the package and the test bench with wired, guest and external networks;
- [`../../apps/metaboxd/internal/httpapi`](../../apps/metaboxd/internal/httpapi): the implementation.
