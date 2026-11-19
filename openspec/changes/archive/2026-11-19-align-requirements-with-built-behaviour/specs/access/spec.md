## MODIFIED Requirements

### Requirement: AC-18 The panel is reachable from LAN only

The daemon SHALL be reachable from all LAN interfaces — wired, wireless and guest — and unreachable from outside: a request from WAN does not pass. The set of local interfaces is configured on the device and changes without rebuilding the daemon. A listen address that is not up yet at start does not stop the daemon: it starts on the addresses that are up, and refuses to start only when none of them opened.

#### Scenario: LAN and guest reach the panel, WAN does not

- **GIVEN** the test bench with lan, guest and wan networks
- **WHEN** a client in each network requests the panel
- **THEN** lan and guest get a reply and wan is refused

#### Scenario: The interface list is changed on the device

- **GIVEN** an interface added to `list listen_interface` in UCI `metabox`
- **WHEN** the daemon is restarted
- **THEN** it listens on that interface's address, without a rebuild

#### Scenario: A listen address that is not up yet

- **GIVEN** two listen addresses, one of which cannot be opened yet
- **WHEN** the daemon starts
- **THEN** it listens on the other address and reports the one that failed

### Requirement: AC-69 The panel can be protected by a password

The panel SHALL be able to be protected by a password. The password is optional and not set by default: without it the panel is open as before. It is set, changed and removed in the panel and reset over SSH. With a password set, a request to the panel API without a session gets 401, except `GET /api/auth` and the login and logout endpoints; every address outside the API answers without a session, among them the daemon health check, the panel static files, the root certificate file of AC-74 and the MCP endpoint, which checks its own token (AC-71). Five wrong passwords from one network — an IPv4 /24 or an IPv6 /64 — within 15 minutes lock login from that network for 5 minutes. While wrong passwords from ten or more networks fall within 15 minutes, every login attempt from a network that is not locked waits 2 seconds before the password is checked: the slowdown reaches every network, while a lockout still takes only a network with five wrong passwords. A mutating request from a foreign origin gets 403 with or without a password (AC-19). Done after the router switches to metabox (OQ-14, 2026-10-09); decision in [ADR-0052](../../../../../docs/adr/ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md).

#### Scenario: No password by default

- **GIVEN** a fresh installation
- **WHEN** a request comes without a session
- **THEN** the request is served: the panel is open

#### Scenario: A request without a session is refused

- **GIVEN** a password is set
- **WHEN** an API request comes without a session
- **THEN** it gets 401, while the health check, the panel static files, `GET /api/auth`, login and logout still answer

#### Scenario: Wrong passwords lock the address

- **GIVEN** a password is set
- **WHEN** five wrong passwords come from one address within 15 minutes
- **THEN** that address is locked for 5 minutes

#### Scenario: Wrong passwords lock the whole network

- **GIVEN** a password is set
- **WHEN** five wrong passwords come from different addresses of one IPv4 /24 or one IPv6 /64 within 15 minutes
- **THEN** login from any address of that network is locked for 5 minutes, and another network can still log in

#### Scenario: Failures from many networks slow every login

- **GIVEN** a password is set and wrong passwords came from ten networks within 15 minutes
- **WHEN** the owner logs in with the right password from another network
- **THEN** the login succeeds after a 2-second wait, and without the wait once the 15 minutes have passed

#### Scenario: A foreign origin cannot mutate

- **WHEN** a mutating request comes from a foreign origin
- **THEN** it gets 403 with or without a password

### Requirement: AC-74 The panel is served over HTTPS on request

With `option https '1'` in UCI `metabox` the panel and the MCP endpoint SHALL be served over HTTPS on the same address and port as plain http. By default HTTPS is off: a root of the daemon's own has to be installed on every device before the browser trusts the panel, which a new user does not do. The daemon issues a root certificate once and keeps it in its state directory. The root's name constraints admit the private networks (10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, `::1`, fc00::/7, fe80::/10), the panel addresses outside them, and the names the panel had when the root was issued: `localhost` and the host from `-allowed-origin`. The server certificate is issued under that root for the listen addresses, `localhost` and the host from `-allowed-origin`, and is reissued 30 days before expiry and when the addresses change. An address change inside the private networks keeps the root. A new root is issued only when a panel address or name falls outside its constraints (a public address, or a name the root was not issued for), when its files are missing or cannot be parsed, or when it has expired; every device that trusted the old root then has to install the new one. The root is served at `/metabox-ca.crt` for installing on the owner's devices. A plain http request to the panel port gets a redirect to `https://` on the same address, except the health check and the root certificate file; the session cookie of AC-69 carries `Secure` when the request came over TLS. With `option https '0'`, the default, the daemon serves plain http. With HTTPS on, `https_cert` and `https_key` make it serve a certificate pair the owner already has instead of its own root, read once at start, and the root file is then not served; one of the two set without the other stops the daemon at start with an error. The init script passes `https`, `https_cert` and `https_key` from UCI to the daemon. Decision in [ADR-0056](../../../../../docs/adr/ADR-0056-serve-the-panel-over-https-with-a-root-the-daemon-issues.md).

#### Scenario: HTTPS is off by default

- **GIVEN** UCI `metabox` without `option https`
- **WHEN** the daemon starts
- **THEN** it serves plain http

#### Scenario: Plain http redirects to https

- **GIVEN** `option https '1'` in UCI `metabox`
- **WHEN** a plain http request comes to the panel port
- **THEN** it gets a redirect to `https://` on the same address, except the health check and the root certificate file

#### Scenario: The session cookie is Secure over TLS

- **GIVEN** HTTPS is on
- **WHEN** a login or a logout comes over TLS
- **THEN** the session cookie it sets carries `Secure`

#### Scenario: A new private address keeps the root

- **GIVEN** a root issued for the panel on a private address
- **WHEN** the daemon starts with one more private address
- **THEN** the root stays and the server certificate covers the new address

#### Scenario: A public address gets a new root

- **GIVEN** a root issued for the panel on a private address
- **WHEN** the daemon starts with a public address added
- **THEN** a new root is issued and the server certificate covers the public address

#### Scenario: A broken server certificate is reissued under the same root

- **GIVEN** the server certificate file cannot be parsed
- **WHEN** the daemon starts
- **THEN** a new server certificate is issued under the same root

#### Scenario: The owner's certificate replaces the daemon root

- **GIVEN** `https_cert` and `https_key` are set
- **WHEN** the daemon serves HTTPS
- **THEN** it serves that certificate pair, and `/metabox-ca.crt` gives no root certificate

#### Scenario: The UCI settings reach the daemon

- **GIVEN** `https`, `https_cert` and `https_key` set in UCI `metabox`
- **WHEN** the init script starts the daemon
- **THEN** the daemon command carries `-https=1`, `-https-cert` and `-https-key` with those paths
