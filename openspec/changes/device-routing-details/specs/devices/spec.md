## ADDED Requirements

### Requirement: AC-121 Device details show associated rules and open connections

The Devices screen SHALL expand a device's routing detail below its row. The detail shows rules associated with the selected device and a summary of its open connections. A connection shows its observed rule, outbound and server when each value is available. The full Connections view opens filtered to the device.

#### Scenario: Expand and close one device's detail

- **GIVEN** the device list contains more than one device
- **WHEN** the operator opens a device's row disclosure
- **THEN** its rules and open connection summary appear below that row, with the rule order and available route details
- **AND** the disclosure exposes its expanded state and retains the selected device's identity
- **WHEN** the operator closes the detail with the keyboard
- **THEN** focus returns to that row's disclosure

#### Scenario: A rule or route cannot be attributed

- **GIVEN** association or route information is unavailable for a rule or connection
- **WHEN** the device detail is shown
- **THEN** the affected value is shown as unknown or unavailable
- **AND** an unknown result is distinguishable from a successfully loaded empty list or an observed route

#### Scenario: View all open connections for the device

- **GIVEN** the detail shows the device's open connection summary
- **WHEN** the operator follows its Connections action
- **THEN** Connections opens filtered to the selected device under AC-61

### Requirement: AC-122 A device row opens the Simple Routes rule flow for that device

The expanded device row SHALL offer the Simple Routes add-rule flow with that device already selected. Completing the form stages the rule in the shared draft with a device condition under AC-62. Opening or cancelling the form leaves the config unchanged.

#### Scenario: Start a rule with a device selected

- **GIVEN** a device's detail is expanded
- **WHEN** the operator chooses Add a rule for this device
- **THEN** the Simple Routes form opens with the device selected
- **AND** a dynamic address shows the existing lease warning under AC-62

#### Scenario: Stage a device-specific rule

- **GIVEN** the device-scoped Simple Routes form contains a valid rule
- **WHEN** the operator stages it
- **THEN** the shared draft contains the new rule with its device source condition
- **AND** applying the draft remains a separate action

#### Scenario: Cancel device rule creation

- **GIVEN** the operator has opened the rule form from the device
- **WHEN** the operator cancels
- **THEN** no rule is staged and the device context is available again
