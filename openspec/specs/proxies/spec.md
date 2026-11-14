# Proxies Specification

## Purpose

Runtime control of outbound nodes through the Clash API: groups and nodes, the routing mode, subscription updates.

## Requirements

### Requirement: AC-11 The Proxies screen switches nodes and checks latency

The Proxies screen SHALL show groups and nodes, allows switching the active node and running a latency check.

#### Scenario: Groups of the config are shown

- **GIVEN** a config with groups and their nodes
- **WHEN** the Proxies screen opens
- **THEN** the groups are shown with their nodes

#### Scenario: The active node of a selector is switched

- **GIVEN** a selector group
- **WHEN** the user picks another node
- **THEN** the choice is sent to the runtime

#### Scenario: The latency check covers the whole group

- **GIVEN** a group with several nodes
- **WHEN** the user runs the latency check of the group
- **THEN** every node of the group is tested, not only the active one

### Requirement: AC-45 The routing mode is switched from the panel

The sing-box routing mode (`Rule`, `Global`, `Direct`) SHALL be switched from the panel, not only shown. The mode is runtime state, not config: switching goes to the Clash API and does not touch the file, so it has no apply bar and no confirmation window. The current mode is shown and switched on the overview screen, and a runtime failure is shown the same way as for other runtime actions.

#### Scenario: The current mode is shown

- **GIVEN** a running sing-box
- **WHEN** the mode switch is shown
- **THEN** it shows the runtime mode

#### Scenario: A switch is a runtime request

- **GIVEN** the mode switch on the overview screen
- **WHEN** another mode is chosen
- **THEN** the panel sends one Clash API request with the new mode

#### Scenario: A failed switch is reported

- **GIVEN** a runtime that rejects the switch
- **WHEN** another mode is chosen
- **THEN** the previous mode comes back and a toast reports the failure

### Requirement: AC-64 Subscription update and shrink warning

The `providers` subscription SHALL be updated from the panel manually via the Clash API. For a `remote` rule set the fork's Clash API has no endpoint: in `v1.14.1-extended-2.7.2` `PUT /providers/rules/{name}` is a stub returning 404 (`experimental/clashapi/ruleprovider.go`), so rule sets are updated by sing-box's own `update_interval` or by a service restart. After a subscription update, manual or one the core made in the background, the panel shows the previous and the new node count of the subscription and warns when the set collapses (two nodes or fewer left of at least three times as many) or becomes empty: the core replaces the set and its cache without a guard. The browser remembers the counts it saw, so a background drop is shown on the next visit from the same browser. Issue #254

#### Scenario: A manual update goes to the Clash API

- **GIVEN** a subscription
- **WHEN** the user updates it
- **THEN** the panel sends `PUT` for that provider through the Clash API and rereads the subscription list

#### Scenario: A collapsed set is warned about

- **GIVEN** a subscription update
- **WHEN** two nodes or fewer are left of at least three times as many
- **THEN** the panel shows the previous and the new node count and warns

#### Scenario: A background drop is noticed

- **GIVEN** a node count the browser remembered
- **WHEN** the core shrank the set while the panel was closed
- **THEN** the drop is shown on the next visit
