# Access Specification

## Purpose

Who can reach the panel and what it reveals: the interfaces it listens on, protection from foreign requests, the optional password, HTTPS and masking of secrets.

## Requirements

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

### Requirement: AC-19 Foreign mutating requests are rejected

Mutating requests with a mismatched `Origin`/`Host` SHALL be rejected.

#### Scenario: A foreign or absent Origin is rejected

- **GIVEN** a mutating request
- **WHEN** its `Origin` is foreign or absent
- **THEN** the daemon rejects it

#### Scenario: The Origin must match the Host

- **GIVEN** a mutating request whose `Origin` differs from its `Host` by host or port
- **WHEN** it reaches the daemon
- **THEN** the daemon rejects it

#### Scenario: A foreign Host is rejected

- **GIVEN** a mutating request whose `Host` is a foreign name
- **WHEN** it reaches the daemon
- **THEN** it is rejected regardless of `Origin`

### Requirement: AC-66 Secrets are masked in forms

Secrets in forms — subscription URLs and the Clash API `secret` — SHALL be shown masked and revealed by a button; the full value goes into the diff. Done for node forms on 2026-10-09 (`secret`, `password`, `private_key`, `pre_shared_key`, `psk`, `token`, `auth_str`, `access_key_secret`; for `url` and `download_url` everything after the host is hidden). On 2026-10-19: the `experimental` section opens as a form, so `experimental.clash_api.secret` is masked too; a field that the form shows as JSON text and that holds a secret key at any depth is shown masked and read-only until revealed. Not masked by design: the JSON tab of a node and the whole-config text screen show values as they are — text there is edited in place, and a mask would not be a value. On 2026-10-20 the list grew by `uuid` (for vless and vmess it is the credential itself), `key` (every such key in the fork schema is key material: TLS, ECH, OpenVPN, VPN users), `auth_key`, `api_token`, `api_key`, `mac_key` and the `Authorization` and `Proxy-Authorization` headers; a key matches in any case, and a secret given as a list or an object is masked in every string inside it. The daemon masks MCP results by the same list (AC-73). Since 2026-10-24 the list is a catalogue `tools/schemagen` derives from the fork option types: a key that ends with `key`, `password`, `secret`, `token`, `psk`, `passphrase` or `uuid`, plus `auth` and `auth_str`, except `public_key`; it is printed into the generated schema and the generated field reference, and both the forms and the daemon read it. Only `url` and `download_url` stay hand-written.

#### Scenario: A password is masked and revealed by a button

- **GIVEN** a node form with a password
- **WHEN** the form opens
- **THEN** the password is masked, a button reveals it and the draft is untouched

#### Scenario: The full value goes into the diff

- **GIVEN** a password typed under the mask
- **WHEN** the edit is written
- **THEN** the draft and the diff carry the full value

#### Scenario: A subscription URL is hidden after the host

- **GIVEN** a provider URL
- **WHEN** the form opens
- **THEN** the host is shown, the rest is revealed by a button and is editable

#### Scenario: A remote rule set URL is hidden after the host

- **GIVEN** a `remote` rule set with a URL
- **WHEN** its form opens
- **THEN** the address after the host is hidden and revealed by a button

#### Scenario: The Clash API secret is masked

- **GIVEN** the `experimental` section
- **WHEN** it opens
- **THEN** it opens with a form that hides the `clash_api` secret

#### Scenario: Secrets inside a JSON field

- **GIVEN** a field shown as JSON text that holds a secret key
- **WHEN** the form opens
- **THEN** the field is masked and read-only until revealed

#### Scenario: uuid is masked

- **GIVEN** a vless node
- **WHEN** its form opens
- **THEN** the `uuid` is hidden

#### Scenario: Headers in any case and as a list

- **GIVEN** an `Authorization` header in another case, given as a list
- **WHEN** the form opens
- **THEN** every string of it is hidden

#### Scenario: The catalogue rule

- **GIVEN** the fork option types
- **WHEN** the schema generator derives the secret catalogue
- **THEN** a key ending with `key`, `password`, `secret`, `token`, `psk`, `passphrase` or `uuid`, and `auth` and `auth_str`, is a secret, `public_key` is not

#### Scenario: The catalogue is printed into the schema

- **GIVEN** the generated schema
- **WHEN** it is read
- **THEN** it carries the secret catalogue

#### Scenario: MCP results are masked by the same list

- **GIVEN** a config with every catalogued key
- **WHEN** the daemon masks it for MCP
- **THEN** every catalogued key is hidden

### Requirement: AC-69 The panel can be protected by a password

The panel SHALL be able to be protected by a password. The password is optional and not set by default: without it the panel is open as before. It is set, changed and removed in the panel and reset over SSH. With a password set, a request to the panel API without a session gets 401, except `GET /api/auth` and the login and logout endpoints; every address outside the API answers without a session, among them the daemon health check, the panel static files, the root certificate file of AC-74 and the MCP endpoint, which checks its own token (AC-71). Five wrong passwords from one network — an IPv4 /24 or an IPv6 /64 — within 15 minutes lock login from that network for 5 minutes. While wrong passwords from ten or more networks fall within 15 minutes, every login attempt, from any network, waits 2 seconds before the password is checked instead of being locked. A mutating request from a foreign origin gets 403 with or without a password (AC-19). Done after the router switches to metabox (OQ-14, 2026-10-09); decision in [ADR-0052](../../../docs/adr/ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md).

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

With `option https '1'` in UCI `metabox` the panel and the MCP endpoint SHALL be served over HTTPS on the same address and port as plain http. By default HTTPS is off: a root of the daemon's own has to be installed on every device before the browser trusts the panel, which a new user does not do. The daemon issues a root certificate once and keeps it in its state directory. The root's name constraints admit the private networks (10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, `::1`, fc00::/7, fe80::/10), the panel addresses outside them, and the names the panel had when the root was issued: `localhost` and the host from `-allowed-origin`. The server certificate is issued under that root for the listen addresses, `localhost` and the host from `-allowed-origin`, and is reissued 30 days before expiry and when the addresses change. An address change inside the private networks keeps the root. A new root is issued only when a panel address or name falls outside its constraints (a public address, or a name the root was not issued for), when its files are missing or cannot be parsed, or when it has expired; every device that trusted the old root then has to install the new one. The root is served at `/metabox-ca.crt` for installing on the owner's devices. A plain http request to the panel port gets a redirect to `https://` on the same address, except the health check and the root certificate file; the session cookie of AC-69 carries `Secure` when the request came over TLS. With `option https '0'`, the default, the daemon serves plain http. With HTTPS on, `https_cert` and `https_key` make it serve a certificate pair the owner already has instead of its own root, read once at start, and the root file is then not served; one of the two set without the other stops the daemon at start with an error. The init script passes `https`, `https_cert` and `https_key` from UCI to the daemon. Decision in [ADR-0056](../../../docs/adr/ADR-0056-serve-the-panel-over-https-with-a-root-the-daemon-issues.md).

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
