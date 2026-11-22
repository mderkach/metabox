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

### Requirement: AC-113 Each server's norm is edited in its Proxies row

Proxies SHALL offer a compact inline editor for each editable server's usual latency in milliseconds. The shared heading identifies automatic mode as the default. A stored override has a passive “Custom norm” label and a separate “Return to auto” button. The name editor stays separate. Saving a norm or restoring automatic mode changes only the selected server's norm through its metadata and needs no Apply.

#### Scenario: The norm is saved inline without moving the row

- **GIVEN** an editable server in automatic mode, with a computed norm or no data
- **WHEN** the user activates the value or pencil and saves an integer from 1 to 10000 ms by pressing Enter or the Save button
- **THEN** the row shows the saved manual norm and focus returns to its edit button
- **AND** the field, action slot, row height and neighboring columns keep their positions before, during and after editing
- **AND** the existing server name and other entries stay intact, with no draft or Apply request

#### Scenario: Escape discards the edited norm

- **GIVEN** the user has changed the field without saving
- **WHEN** the user presses Escape
- **THEN** the editor restores the last saved or computed reading and focus returns to the edit button without sending a write

#### Scenario: Reset restores the current automatic norm

- **GIVEN** a server has a manual norm and a computed norm is available
- **WHEN** the user activates “Return to auto” with the keyboard or pointer
- **THEN** only this server's manual norm is removed, the current automatic norm is shown, and focus returns to the edit button
- **AND** the history chart and latency comparison use that automatic norm and the current samples
- **AND** the server's name and the other server rows keep their saved values
- **AND** the row height, the field's size and position, the action slot, and the neighboring columns stay stable

#### Scenario: Reset with no computed norm while a refresh is pending

- **GIVEN** a server has a manual norm, no computed norm, and a latency reply from before the reset
- **WHEN** the daemon accepts “Return to auto” and the latency refresh is pending
- **THEN** the field shows no data, and the chart and comparison omit a norm until current data supports one
- **AND** the old manual norm does not appear as an automatic norm or produce a stale comparison
- **AND** the server's name and the other server rows keep their saved values
- **AND** the row height, the field's size and position, the action slot, and the neighboring columns stay stable

#### Scenario: A probe failure remains separate from a norm comparison

- **GIVEN** the server has a check failure or a failed request prevented the check
- **WHEN** its norm changes or returns to automatic mode
- **THEN** the row still reports the observed diagnosis as before the change
