# ADR-0052. Protect the panel with an optional password and a cookie session

- Status: Accepted
- Date: 2026-10-15
- Deciders: repository owner
- Supersedes: [ADR-0041](./ADR-0041-run-v1-without-authentication-behind-network-and-origin-checks.md), the "no authentication" part; its `Origin` and `Host` checks stay

## Context and problem statement

The panel controls routing for the whole router network. Under [ADR-0041](./ADR-0041-run-v1-without-authentication-behind-network-and-origin-checks.md) only the listen address (`listen_interface`, `lan` by default) and the `Origin`/`Host` checks protect it: any device that reaches the panel address can change the config, the dataplane model and the device ACL (risk R-1 in [`../PRD.md`](../PRD.md)). Since 2026-10-11 metabox owns routing on the owner's router, and the repository is public, so R-1 is no longer a theoretical risk for one user. AC-69 asks for password login, sessions and API protection after the switch from homeproxy.

The owner chose the login model of b4 on 2026-10-13: the password is optional, it is set in the panel, it is reset over SSH, and five failed attempts from one address lock that address out. The b4 implementation is `src/http/auth.go` and `src/config/password.go` in DanielLavrushin/b4.

Facts the decision depends on:

- The daemon module has no dependencies, and a new one needs a separate ADR ([`../../apps/metaboxd/AGENTS.md`](../../apps/metaboxd/AGENTS.md)). Go 1.26 from `.go-version` has `crypto/pbkdf2` in the standard library.
- Both init scripts of the package, `metaboxd` and `metabox-singbox`, register `procd_add_reload_trigger metabox`. On the test bench on 2026-10-15 `uci commit metabox` by itself restarted nothing, and the next `reload_config` restarted both the daemon and sing-box: the pids changed. A separate config `metabox_auth` committed the same way restarted nothing. The file in `/etc/config` was created with mode 0644.
- The daemon service directory `/etc/metabox` is 0700, files in it are written atomically with mode 0600, and the directory is kept across sysupgrade by the package's `keep.d`. Device names already live there ([ADR-0048](./ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md)).
- The panel is served over plain http in the LAN, from the same origin as the API. The runtime streams `GET /api/events` and `GET /api/logs/stream` are `EventSource`, which cannot set request headers.

In scope: who may call the API, where the password lives, the session, brute force protection. Out of scope: HTTPS, access from outside the LAN, user accounts and roles.

## Decision drivers

- AC-69: with a password, a request without a session gets 401.
- Rule R-1 from the PRD is closed without breaking a router that runs without a password today.
- A password change must not restart sing-box or the daemon.
- No new dependency in the daemon module.
- The session token cannot be read by a script on the page, and the protection works for `EventSource`.
- A forgotten password is reset without reinstalling the package.

## Considered options

### Where the password hash lives

1. **The `password_hash` option in UCI `metabox.main`**, as decided on 2026-10-13. Visible in `uci show`. Any `reload_config` after a password change restarts sing-box and the daemon through the procd triggers and drops every session; the file is 0644; the write needs a `uci batch` with a read-back check. **Rejected** because of the restarts.
2. **A separate UCI config `metabox_auth`.** No triggers, reset with `uci delete`. The file is 0644 and in the LuCI and `uci show` output, the package ships one more config, and the write needs the same `uci batch` with a read-back check as the dataplane. **Rejected**: more code and a wider read access than option 3, for the sake of visibility that is a drawback for a password hash.
3. **The `auth.json` file in the daemon service directory.** Written by the same atomic write as the device names, mode 0600 in a 0700 directory, kept across sysupgrade, no triggers. Reset is removing the file and restarting the daemon. **Chosen.**

### Where the session token lives in the browser

1. **`localStorage` and an `Authorization: Bearer` header**, as in b4. A script on the page reads the token. `EventSource` cannot send the header, so the streams would need the token in the URL, and it would get into logs. **Rejected.**
2. **A cookie with `HttpOnly` and `SameSite=Strict`.** The browser sends it with every same-origin request, `EventSource` included. A script does not see it. A foreign site cannot make the browser send it, and the `Origin` check from ADR-0041 stays on top. **Chosen.**

### Keep the current approach

Leaving the panel without a password keeps R-1 open on a router that already routes the network, while AC-69 requires closing it. **Rejected.**

## Decision outcome

The password is optional. Without `auth.json` or with an empty hash in it, the panel works as before, without login.

- **Hash.** PBKDF2-HMAC-SHA256 from `crypto/pbkdf2`, a random 16-byte salt, 600 000 iterations, a 32-byte key. The file stores the algorithm, the iteration count, the salt and the key, so the iteration count can be raised later without breaking stored hashes. Comparison is constant-time. The password is 8 to 128 characters.
- **Storage.** `<state-dir>/auth.json`, mode 0600, atomic write. Reset: `rm /etc/metabox/auth.json` and `/etc/init.d/metaboxd restart`.
- **Session.** `POST /api/auth/login` checks the password and sets the `metabox_session` cookie: a random token of about 260 bits (`crypto/rand.Text` twice), `HttpOnly`, `SameSite=Strict`, `Path=/`, without `Max-Age`. Sessions live in the daemon memory: 24 hours since the last request, at most 64 at once, the one closest to expiry is evicted first. After a daemon restart the user logs in again. `POST /api/auth/logout` drops the session and clears the cookie.
- **Protected routes.** With a password set, every request without a valid session gets 401 `unauthorized`, except `GET /healthz`, `GET /api/auth`, `POST /api/auth/login`, `POST /api/auth/logout` and paths outside `/api/`, which serve the SPA. The check runs after the `Host` and `Origin` checks, so a mutating request from a foreign origin still gets 403 before the session is looked at.
- **Password change.** `PUT /api/auth/password` with `{current, password}`. Without a password, anyone who reaches the panel may set the first one, as in b4. With a password, the call needs a session and the current password. An empty `password` removes the password. A successful change drops every session and gives the caller a new one; removal drops every session.
- **Brute force.** Five wrong passwords from one address within 15 minutes lock that address for 5 minutes: login and password change answer 429 `login_locked` with `Retry-After`. The address comes from `RemoteAddr`. Entries older than 15 minutes are dropped on each check.
- **Origin and Host.** The checks from ADR-0041 stay as they are.

### Scope and boundaries

- `apps/metaboxd/internal/auth`: the hash, sessions and the lockout.
- `apps/metaboxd/internal/httpapi`: the middleware and the `/api/auth` endpoints.
- `apps/web`: the login screen, the switch to it on 401, the password dialog and the logout button.

## Consequences

### Positive

- With a password, a device in the LAN without the password cannot read or change anything over the API.
- A password change restarts nothing on the router.
- The daemon module stays without dependencies.

### Negative

- Until the owner sets a password, the panel is open as before, and the first device to reach it may set the password and lock the owner out until the reset over SSH.
- A daemon restart, including a package update, logs everybody out.
- A stream opened before logout, before a password change or before the session expired keeps running until it closes: the check is done when the request starts. A password change therefore does not cut an intruder's open `/api/events` or log stream.
- Without HTTPS the password and the cookie travel in clear text inside the LAN.
- The lockout counts by `RemoteAddr`: behind the dev server proxy all clients share one address, while a LAN device that changes its address (IPv6 privacy addresses, IPv4 aliases) gets five more guesses per address. Hashing has no concurrency limit, so a burst of guesses from many addresses loads every core of the router.
- PBKDF2 at 600 000 iterations takes a noticeable CPU slice on each login and password change; this was not measured on the BPI-R4.

### Neutral or deferred

- HTTPS and access from outside the LAN stay on the roadmap.
- The optional password suits a router panel listening only on local networks. A panel reachable from the internet, a VPS install or the router WAN, cannot have an open window before the first password: there the credentials would have to exist from the first start. That is a separate decision together with such a deployment; this one does not block it, since the guard and the hash file do not depend on how the password first appears.
- The password is not in UCI and is not visible in LuCI.

## Risks and mitigations

| Risk                                                       | Likelihood and impact          | Mitigation                                                                |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| A guest sets the first password before the owner           | low, the owner loses the panel | reset over SSH; the README says that without a password the panel is open |
| Password guessing from the LAN                             | medium, routing control        | the per-address lockout; PBKDF2 slows offline guessing of a stolen file   |
| The owner forgets the password                             | medium, a panel without access | reset over SSH, written in the README                                     |
| The session table grows without bound on a months-long run | low, memory                    | at most 64 sessions, expired ones are dropped                             |

## Compatibility, migration and rollback

A daemon without `auth.json` behaves as before: there is no migration for routers without a password. The panel of an older version does not know the 401 and shows it as a request failure; the panel and the daemon ship in one package. Rollback: remove `auth.json` and restart the daemon, or install the previous package.

## Validation

- `go test ./...` in `apps/metaboxd`: hash round trip and a wrong password, session expiry and its sliding, the session cap, the lockout and its expiry, 401 without a session on a protected route, the exempt routes, 403 before 401 for a foreign `Origin`, the password change dropping other sessions, the file write failure leaving the old password in force.
- `pnpm test` in `apps/web`: the switch to the login screen on 401 and back after login.
- Test bench: set a password, check `curl` without the cookie gets 401, log in, change the password, remove `auth.json` and restart the daemon.

## Links

- [`../PRD.md`](../PRD.md): AC-69, risk R-1, milestone M6;
- [ADR-0041](./ADR-0041-run-v1-without-authentication-behind-network-and-origin-checks.md): the access model this ADR changes;
- [ADR-0048](./ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md): the service directory as the place for the daemon's own state;
- [HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md): the middleware chain and the origin check;
- [`../../apps/metaboxd/package/etc/init.d/metaboxd`](../../apps/metaboxd/package/etc/init.d/metaboxd): the procd reload trigger on `metabox`;
- b4: `src/http/auth.go`, `src/config/password.go` in [DanielLavrushin/b4](https://github.com/DanielLavrushin/b4).
