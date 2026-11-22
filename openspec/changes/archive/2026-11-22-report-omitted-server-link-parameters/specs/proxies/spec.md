## MODIFIED Requirements

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

#### Scenario: A failed manual check offers guidance for an existing REALITY node

- **GIVEN** an editable applied VLESS REALITY outbound whose supported hybrid key share setting is absent or false
- **WHEN** the operator manually checks the node and the node returns a failed probe outcome
- **THEN** the panel suggests checking that setting after a server upgrade and points to the node editor
- **AND** the hint describes a possible cause and leaves the config and routing unchanged

#### Scenario: Other outcomes use ordinary check feedback

- **GIVEN** a probe that succeeds, a failure to reach the runtime API, or a failed probe for an ineligible node
- **WHEN** the operator sees the result
- **THEN** ordinary feedback is shown without the REALITY hint
