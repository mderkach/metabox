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
- **WHEN** the operator manually checks it and the node does not answer
- **THEN** a diagnostic control appears beside that node's status inside the checked group or standalone list, at most once per node on the screen
- **AND** opening it reveals the possible cause below the node without attributing the failure to the setting
- **AND** the row and its column widths stay stable when the control appears or the status changes
- **AND** the operator can enable this setting in the draft through the disclosure while preserving other edits and leaving the applied config and routing unchanged

#### Scenario: An applied suggestion can be tested again

- **GIVEN** the suggested change has been applied and the operator has confirmed router connectivity
- **WHEN** the operator repeats the latency check from the disclosure
- **THEN** the panel checks the same outbound on the confirmed applied revision
- **AND** a real latency measurement clears the diagnostic
- **AND** a response from a superseded config or probe does not update this attempt

#### Scenario: The server still does not answer after the change

- **GIVEN** the panel can attribute the applied change to this diagnostic and a fresh probe on that revision yields no response
- **WHEN** the operator views the result
- **THEN** the panel says the server still did not answer, names the enabled setting, and gives guidance on checking a new server link or updating a subscription
- **AND** it can return the previous value of this field through the existing draft and Apply flow
- **AND** it removes an originally absent field or restores an explicitly false value, without changing other fields
- **AND** it offers no return when the node, applied revision, or current draft no longer allows a safe inverse

#### Scenario: The panel cannot run the repeated check

- **GIVEN** the applied diagnostic change is awaiting verification
- **WHEN** a request or runtime error prevents the repeated check
- **THEN** the panel reports that the check could not be completed and offers a retry without treating it as a node failure or offering a field return

#### Scenario: Other outcomes use ordinary check feedback

- **GIVEN** an initial probe that succeeds, a failure to reach the runtime API, or a failed probe for an ineligible node
- **WHEN** the operator sees the result
- **THEN** ordinary feedback is shown without the REALITY hint
