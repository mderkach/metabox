## ADDED Requirements

### Requirement: AC-78 A first-run wizard walks through the settings

A first-run wizard SHALL run the settings sections step by step: the core (which core is installed, its version, installation when it is missing; one choice until roadmap item 1), the password, MCP access, the devices that go through sing-box, and the first config with the dataplane inbounds and `experimental.clash_api`. Each step can be skipped on the router. The wizard does not block the panel: until it is finished, a banner offers to continue it, and it can be reopened from "Settings". The daemon keeps a "first run finished" flag in its state; an installation that already has a config gets the flag on upgrade.

#### Scenario: A step is skipped

- **GIVEN** the wizard is open on the router
- **WHEN** the user skips a step
- **THEN** the wizard moves to the next step

#### Scenario: An unfinished wizard does not block the panel

- **GIVEN** the wizard was left unfinished
- **WHEN** the user opens the panel
- **THEN** the panel works, a banner offers to continue the wizard and "Settings" can reopen it

#### Scenario: An installation with a config is not asked

- **GIVEN** an installation that already has a config
- **WHEN** it is upgraded
- **THEN** the daemon sets the "first run finished" flag

### Requirement: AC-79 The devices step of the wizard enables interception

The "devices" step of the wizard SHALL enable interception in ACL mode `listed` with the devices the user ticked; mode `all` is a deliberate choice in the same step. Turning interception on goes through the AC-53 confirmation window; when another service is running sing-box, the step warns and does not enable interception. On a platform without a dataplane the step is absent, and the password step cannot be skipped.

#### Scenario: Ticked devices go through sing-box

- **GIVEN** the user ticks devices in the "devices" step
- **WHEN** the step is confirmed
- **THEN** interception is enabled in ACL mode `listed` with those devices through the confirmation window

#### Scenario: Another service runs sing-box

- **GIVEN** another service is running sing-box
- **WHEN** the user reaches the "devices" step
- **THEN** the step warns and does not enable interception

#### Scenario: A platform without a dataplane

- **GIVEN** a platform without a dataplane
- **WHEN** the wizard runs
- **THEN** the "devices" step is absent and the password step cannot be skipped
