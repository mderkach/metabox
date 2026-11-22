## ADDED Requirements

### Requirement: AC-123 Proxies reflects the configured group selection behavior

The Proxies screen SHALL identify how each group selects its active member. It provides manual switching only for selector groups. Automatic groups show the current member when known and retain their configured behavior.

#### Scenario: Select a member in a selector group

- **GIVEN** the group is a selector and the runtime provides its members
- **WHEN** the operator opens its group controls
- **THEN** the selector identifies its current member and offers the existing manual switch action under AC-11

#### Scenario: Inspect an automatic group

- **GIVEN** a group selects members automatically
- **WHEN** the operator views the group
- **THEN** it shows its configured behavior and current member, if known
- **AND** it offers neither a manual member switch nor an action that converts the group to manual selection

### Requirement: AC-124 Proxies shows server sources and known group relationships

The Proxies screen SHALL show a source inventory for servers from subscriptions and servers added manually. It identifies the contributing subscription and group memberships where known. Group details show known use by rules or other groups. Unresolved data is distinguishable from a confirmed absence of membership or use.

#### Scenario: Identify a subscription and a manually added server

- **GIVEN** the source is known for servers from a subscription and servers added manually
- **WHEN** the operator views the source inventory
- **THEN** the subscription name identifies its servers, manual servers appear separately, and each server shows its known memberships

#### Scenario: Inspect known group references

- **GIVEN** a group is referenced by a rule or by another group and the reference has been resolved
- **WHEN** the group details are shown
- **THEN** they identify the known reference and its type

#### Scenario: Membership or source is unknown

- **GIVEN** a server has no resolved source or its membership information is incomplete
- **WHEN** its row is shown
- **THEN** the screen distinguishes unknown from a confirmed manually added server or a confirmed server outside all groups
- **AND** a missing membership alone does not assert that a rule cannot use the server

#### Scenario: Review a server while checking its norm

- **GIVEN** the operator is viewing a server in the reorganized Proxies screen
- **WHEN** its latency or norm changes
- **THEN** current latency, norm, comparison and diagnosis behavior remains available under AC-11 and AC-113
