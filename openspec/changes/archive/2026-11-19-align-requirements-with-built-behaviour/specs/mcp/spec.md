## MODIFIED Requirements

### Requirement: AC-71 MCP endpoint with its own token, off by default

The daemon SHALL serve an MCP endpoint for agents (Claude Code and other MCP clients) on the same address as the panel. It is off by default: while it is off, the endpoint answers as an unknown path. It is enabled and disabled in the panel; enabling generates an access token that is shown once and can be regenerated, which invalidates the old one. Regenerating the token and disabling MCP in the panel ask for a confirmation first; a cancelled confirmation leaves the token as it was. A request without the token or with a wrong one gets 401, a request with a foreign `Origin` gets 403, the `Host` check of AC-19 applies; a request without `Origin` is accepted, because the token cannot be sent by a foreign page. The token does not depend on the panel password (AC-69): it works with or without one, the panel session does not open the endpoint and the token does not open the panel API. MCP is disabled over SSH without reinstalling the package; turning it on or off and changing the token restart neither sing-box nor the daemon.

#### Scenario: The endpoint answers as an unknown path while MCP is off

- **GIVEN** MCP is off
- **WHEN** a client requests `/mcp`
- **THEN** the status and body are the same as for an unknown path

#### Scenario: A request without the token or with a wrong one gets 401

- **GIVEN** MCP is on
- **WHEN** a request comes without a token, with a wrong token or with another authorization scheme
- **THEN** it gets 401

#### Scenario: A foreign Origin or Host gets 403, no Origin is accepted

- **GIVEN** MCP is on and the client holds the token
- **WHEN** a request comes with a foreign `Origin`, or with a foreign `Host`
- **THEN** it gets 403, while the same request without `Origin` or with the panel's own `Origin` is accepted

#### Scenario: The token and the panel session do not open each other

- **GIVEN** a panel password is set and MCP is on
- **WHEN** a request to `/mcp` carries only the panel session, and a request to the panel API carries only the token
- **THEN** both get 401

#### Scenario: Regenerating the token invalidates the old one

- **GIVEN** a token was issued
- **WHEN** a new token is generated
- **THEN** the old token gets 401 and the new one is accepted

#### Scenario: The panel turns MCP on and off

- **GIVEN** MCP is off
- **WHEN** the panel issues a token and later disables MCP
- **THEN** the endpoint accepts the issued token while MCP is on, and after disabling answers as an unknown path

#### Scenario: The panel shows the token once

- **GIVEN** the MCP access section of the panel
- **WHEN** the operator enables MCP and closes the token with "Done"
- **THEN** the token is shown after enabling and is not shown again

#### Scenario: Regenerating the token asks for a confirmation

- **GIVEN** MCP is on in the panel
- **WHEN** the operator asks to regenerate the token
- **THEN** the panel warns that the old token stops working and issues a new one only after the confirmation; a cancel issues nothing

#### Scenario: Disabling MCP asks for a confirmation

- **GIVEN** MCP is on in the panel
- **WHEN** the operator disables MCP and confirms
- **THEN** MCP is off
