# Clash API Specification

## Purpose

The Clash API of sing-box as the source of runtime data for the panel: how the daemon makes sure the applied config has it.

## Requirements

### Requirement: AC-31 The applied config always has a working Clash API

The daemon SHALL guarantee that the applied config contains a working `experimental.clash_api`. If the section is missing, the daemon adds it whole: `external_controller` with the value `127.0.0.1:<port>` and a generated `secret`. If the section exists but `external_controller` is missing or empty, only the address is added. Other user values are not changed, and `secret` is not added to a section the user created: an empty secret disables Clash API authorization, and an added token would cut off already configured clients.

#### Scenario: The section is missing

- **GIVEN** a config without `experimental.clash_api`
- **WHEN** the daemon guarantees the section
- **THEN** it adds the section with the address `127.0.0.1` and the port, and a generated secret

#### Scenario: `experimental` exists without `clash_api`

- **GIVEN** a config with another `experimental` setting
- **WHEN** the daemon guarantees the section
- **THEN** it adds `clash_api` with an address and a secret and keeps the neighbouring setting

#### Scenario: The address is empty

- **GIVEN** a `clash_api` section with an empty `external_controller` and no secret
- **WHEN** the daemon guarantees the section
- **THEN** it fills the address and adds no secret

#### Scenario: The address is missing

- **GIVEN** a `clash_api` section with a user secret and no `external_controller`
- **WHEN** the daemon guarantees the section
- **THEN** it adds the address and keeps the user secret

#### Scenario: The controller is configured

- **GIVEN** a `clash_api` section with an `external_controller`
- **WHEN** the daemon guarantees the section
- **THEN** the config bytes do not change

#### Scenario: Every Apply guarantees the section

- **GIVEN** a config without the section
- **WHEN** it is applied
- **THEN** the written config has a working `clash_api`

### Requirement: AC-32 Adding the Clash API section is applied and shown explicitly

Adding the section SHALL go through the normal Apply protocol and is shown to the user explicitly as a change initiated by metabox, with the reason and the fact that a sing-box restart will be required.

#### Scenario: The transaction marks the addition

- **GIVEN** a config without the section
- **WHEN** it goes through Apply
- **THEN** the transaction marks that the daemon added the section

#### Scenario: The panel names the addition

- **GIVEN** an Apply transaction marked with the added section
- **WHEN** the Apply bar shows it
- **THEN** it says that metabox added `experimental.clash_api`, why, and that this requires a sing-box restart

### Requirement: AC-33 Screens work without the API service section

The daemon SHALL NOT add a `service` section of type `api` on its own: it appears only on an explicit user action and goes through the normal Apply protocol. The presence or absence of this section does not disable any screen: while there is no event source, connections are read as Clash API snapshots. `GET /api/status` reports which sources are available and which one is used for connections, and the contract with the frontend does not depend on which one worked. Decision — [ADR-0006](../../../docs/adr/ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md).

#### Scenario: The status names the sources

- **GIVEN** a daemon with or without the event source
- **WHEN** the panel reads `GET /api/status`
- **THEN** the response lists the available sources and names the one used for connections
