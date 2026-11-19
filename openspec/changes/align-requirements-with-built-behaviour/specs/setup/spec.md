## REMOVED Requirements

### Requirement: AC-67 Migration from the previous routing setup

**Reason**: the switch and rollback runbook was a one-off for the owner's router; new users get `install.sh`. A MODIFIED delta cannot drop the scenario of the switch on the router, so the requirement is replaced under a new name with the same ID.

**Migration**: the part that stays is AC-67 "The package installs disabled next to a previous routing setup" below.

## ADDED Requirements

### Requirement: AC-67 The package installs disabled next to a previous routing setup

The package SHALL install while a previous sing-box routing service is running, without touching its dataplane and ports, while the metabox sing-box service is disabled.

#### Scenario: The package stays off next to the previous setup on the test bench

- **GIVEN** another service holds an `ip rule` and a routing table with the dataplane numbers
- **WHEN** a disabled metabox service is started
- **THEN** the foreign rule and table stay and no metabox chains appear
