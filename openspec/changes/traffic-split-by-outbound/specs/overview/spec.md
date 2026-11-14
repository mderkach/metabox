## ADDED Requirements

### Requirement: AC-89 Overview splits traffic by outbound

Overview SHALL split the traffic that passed through sing-box by the outbound of the connection: through a proxy, direct, rejected. The channel share is counted over proxy traffic only, so traffic that a rule released direct does not read as going through the proxy; the labels say "through a proxy" and "direct through sing-box". The daemon accumulates the split together with the AC-37 history.

#### Scenario: Proxied, direct and rejected volumes are shown apart

- **GIVEN** connections that went through a proxy, direct and to a reject outbound
- **WHEN** the user opens Overview
- **THEN** the three volumes are shown apart, labelled "through a proxy" and "direct through sing-box"

#### Scenario: Direct traffic is outside the channel share

- **GIVEN** traffic that a rule released direct
- **WHEN** the channel share is counted
- **THEN** it is counted over proxy traffic only
