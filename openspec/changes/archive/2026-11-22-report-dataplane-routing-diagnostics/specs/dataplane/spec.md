## MODIFIED Requirements

### Requirement: AC-68 Dataplane diagnostics

Dataplane diagnostics: port listeners, a DNS probe through `dns-in`, presence of nft chains, internet access through the selected node. With interception removed, diagnostics names the missing chain, with sing-box stopped — the closed port. The owner uses LuCI diagnostics, so the screen is needed before the switch (OQ-23, 2026-10-09).

The Diagnostics screen and the MCP diagnostics tool SHALL also report the dataplane routing setup. With interception enabled, the check reports whether the firewall mark policy rule, local default route through loopback, and dnsmasq forwarding to the configured DNS port are present. It names the first failing piece. It reports a skipped check when interception is disabled or the check cannot be run.

#### Scenario: A closed port is named

- **GIVEN** sing-box not listening on a dataplane port
- **WHEN** diagnostics runs
- **THEN** the port check fails as not listening

#### Scenario: A missing chain is named

- **GIVEN** interception with a chain removed
- **WHEN** diagnostics runs
- **THEN** the chains check fails and names the missing chain

#### Scenario: The DNS probe goes through dns-in

- **GIVEN** a silent `dns-in`
- **WHEN** diagnostics runs
- **THEN** the DNS probe fails

#### Scenario: Internet access through the selected node

- **GIVEN** a selected node
- **WHEN** diagnostics runs
- **THEN** it reports the delay through that node

#### Scenario: A missing local route is named

- **GIVEN** interception is enabled and its firewall mark rule is present
- **AND** the local default route in its routing table has been removed
- **WHEN** the operator runs Diagnostics or calls the MCP diagnostics tool
- **THEN** the routing setup check fails and names the missing local route

#### Scenario: Interception is disabled

- **GIVEN** interception is disabled
- **WHEN** diagnostics runs
- **THEN** the routing setup check is skipped

#### Scenario: The routing result is unavailable

- **GIVEN** the device cannot produce a routing setup result
- **WHEN** diagnostics runs
- **THEN** the routing setup check is skipped with an unavailable reason
