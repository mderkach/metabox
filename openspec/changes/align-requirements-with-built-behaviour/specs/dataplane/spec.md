## MODIFIED Requirements

### Requirement: AC-53 Dataplane settings are applied with a confirmation window

Changing ACL and dataplane DNS settings SHALL go through the same protocol as Apply of the config: model check, UCI write, service `reload`, confirmation window, automatic rollback to the previous model. An unconfirmed ACL change does not cut off the administrator's device for longer than the window. When an ACL change in the `listed` mode takes the address the request came from out of interception — the address was intercepted before and is not listed by address or subnet after, or is excluded — the daemon log of that apply names the address and says that without a confirmation the change rolls back when the window ends.

#### Scenario: An unconfirmed change rolls back

- **GIVEN** a change of the dataplane model was written and the service reloaded
- **WHEN** the confirmation window ends without a confirmation
- **THEN** the previous model is restored

#### Scenario: A confirmed change stays

- **GIVEN** a change of the dataplane model inside its confirmation window
- **WHEN** the change is confirmed
- **THEN** the window closes and the new model stays

#### Scenario: Excluding the administrator's own address is noted

- **GIVEN** the administrator's address is intercepted as part of a listed subnet
- **WHEN** an ACL change excludes that address, and when another change keeps it listed
- **THEN** the daemon log of the first apply notes that the request address leaves interception, and the second notes nothing
