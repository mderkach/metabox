# Apply Specification

## Purpose

How a config reaches the router: the Apply protocol, the check before it, the version history and rollback.

## Requirements

### Requirement: AC-13 Apply follows the protocol and stops on a failed check

Apply SHALL run the full sequence from [ADR-0002](../../../docs/adr/ADR-0002-apply-protocol-and-config-ownership.md); if `sing-box check` fails, nothing is written and the user sees the error from the binary.

#### Scenario: The steps go in the protocol order

- **GIVEN** a valid config sent to Apply
- **WHEN** the apply runs
- **THEN** the steps go as stage, `sing-box check`, backup, state record, version save, list write, config write, restart, healthcheck, and the transaction waits for confirmation

#### Scenario: A failed check writes nothing

- **GIVEN** a config that `sing-box check` rejects
- **WHEN** it is sent to Apply
- **THEN** the apply fails, neither the state nor the config is written and no transaction is left open

#### Scenario: The binary output reaches the user

- **GIVEN** Apply rejected because `sing-box check` failed
- **WHEN** the panel receives the failure
- **THEN** it shows the sing-box output

### Requirement: AC-15 Config version history and rollback

Config version history SHALL be available in the UI; rollback to any previous version works. If the current list files cannot be read while saved history is readable, the history stays available with a warning and no version marked as current. Restore retains the ordinary Apply checks and may still fail.

#### Scenario: The version on the device is marked

- **GIVEN** saved versions, one of them matching the config file on the device
- **WHEN** the history opens
- **THEN** that version is marked as current

#### Scenario: Rollback starts an ordinary Apply

- **GIVEN** a saved version
- **WHEN** the user rolls back to it
- **THEN** the panel calls the version restore and the daemon starts an Apply of that version's config

#### Scenario: Unreadable current lists degrade the history

- **GIVEN** saved history and current list files that cannot be read
- **WHEN** the history is requested
- **THEN** the versions are returned with a warning and none is marked as current

#### Scenario: A restore can still fail the check

- **GIVEN** a version that `sing-box check` rejects
- **WHEN** the user rolls back to it
- **THEN** the restore fails and the panel shows the `sing-box check` error
