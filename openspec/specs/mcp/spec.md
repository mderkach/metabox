# MCP Server Specification

## Purpose

The MCP endpoint the daemon serves to agents such as Claude Code: how it is turned on, off and protected by its own token, the read-only tools of phase 1, masking of secrets and logging of tool calls, and the config field reference generated from the fork schema.

## Requirements

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

### Requirement: AC-72 Read-only tools of phase 1

Phase 1 SHALL be read-only. The agent gets tools for: sing-box service and daemon state with versions and the routing mode; the route explanation of AC-34 for a domain, from live connections to it, and an explicit "no connection" answer instead of a guess; connections with a filter by host, device, rule, chain and network; proxy groups, nodes and their last known latency, without running a latency check; config version history; the tail of the sing-box log with a level filter; the dataplane diagnostics of AC-68. Every tool is marked read-only for the client. A tool that writes is not offered at all to a token without a write permission, and the status tool names the permissions the agent has.

#### Scenario: Every tool is marked read-only

- **GIVEN** a token with the read permission
- **WHEN** the agent lists the tools
- **THEN** it gets exactly the read tools, each marked read-only and not destructive

#### Scenario: The status tool names versions and permissions

- **GIVEN** a token with the read permission
- **WHEN** the agent calls the status tool
- **THEN** it gets the daemon and sing-box versions, the service state and the permission list `read`

#### Scenario: A domain is explained from a live connection, or not at all

- **GIVEN** a live connection to one domain and none to another
- **WHEN** the agent asks to explain each domain
- **THEN** the first comes back with the matched rule and the chain, the second with an explicit "not found" and no routes

#### Scenario: Connections are filtered by host, device, rule, chain and network

- **GIVEN** live connections
- **WHEN** the agent filters them by host, device name or address, rule, chain or network
- **THEN** it gets only the matching connections

#### Scenario: Proxies come with the last known latency, without a latency check

- **GIVEN** proxy groups and nodes, one with a recorded latency
- **WHEN** the agent lists the proxies
- **THEN** the recorded latency is reported and no latency check is requested from sing-box

#### Scenario: Version history, log tail and diagnostics are read

- **GIVEN** a config history, a log and the dataplane diagnostics
- **WHEN** the agent asks for the versions, the log tail with a level filter and the diagnostics
- **THEN** it gets the versions, the tail at the requested level and the diagnostics report

### Requirement: AC-73 Masked results, logged calls, failures kept inside a tool

Secrets in tool results SHALL be masked by the rules of AC-66, with no way to reveal them through MCP. Each tool call leaves one line in the daemon log with the tool, the client address, the duration and the error reason, without the arguments; a failure inside a tool returns an error to the agent and does not stop the daemon. Decision in [ADR-0055](../../../docs/adr/ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md).

#### Scenario: A config version comes back masked

- **GIVEN** a config version holding secrets
- **WHEN** the agent reads that version
- **THEN** every secret is masked, the non-secret values are kept and the result is still JSON

#### Scenario: The log tail masks URLs

- **GIVEN** a sing-box log line with a rule-set URL
- **WHEN** the agent reads the log tail
- **THEN** the URL path is masked

#### Scenario: A tool call leaves one log line without its arguments

- **GIVEN** MCP is on
- **WHEN** the agent calls a tool with an argument
- **THEN** the daemon log has one line for the call with the client address and the duration, and the argument is not in the log

#### Scenario: A failure inside a tool is a tool error

- **GIVEN** a tool that panics
- **WHEN** the agent calls it
- **THEN** the agent gets a tool error without the panic value, and the next call of the tool is served

### Requirement: AC-76 Config field reference for agents

The agent SHALL get a field reference for a config path written as in a real config (`route.rules.3.outbound`): the value type, the values an enum or a type discriminator allows, the kind of node a tag value names, which node types or actions have the field, the fork's own field comment and a hand-written note, in the operator's language (AC-75), where the schema is not enough. The reference is generated from the same fork schema as the panel forms and changes with it; notes live in a data file next to it, not in code. It does not read the config on the router. Decision in [ADR-0063](../../../docs/adr/ADR-0063-serve-mcp-agents-a-field-reference-generated-from-the-fork-schema.md).

#### Scenario: A path written as in a real config resolves

- **GIVEN** the field reference
- **WHEN** the agent asks for `dns.rules.0.ip_cidr`, `route.rules.3.outbound` or `outbounds.*.type`
- **THEN** it gets the value type, the node kind a tag value names, the type or action that has the field, the values a discriminator allows, and the hand-written note where one exists

#### Scenario: Every note names a known path in both languages

- **GIVEN** the notes data file
- **WHEN** each note path is asked for in English and in Russian
- **THEN** the reference resolves the path and returns the note text of that language

#### Scenario: The reference matches the fork schema

- **GIVEN** the generator run on the fork schema
- **WHEN** its output is compared with the committed reference
- **THEN** they are the same, and the output carries the fork's own field comments
