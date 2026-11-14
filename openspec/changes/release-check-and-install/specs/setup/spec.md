## ADDED Requirements

### Requirement: AC-81 The daemon checks for new releases

The daemon SHALL check the releases of `metaboxd` and of the installed core once a day and on request, and the panel shows the installed and the latest version side by side; the check is off until the user turns it on, and the route of the request (direct or through the selected node) is the user's choice.

#### Scenario: The check is off until turned on

- **GIVEN** a fresh installation
- **WHEN** a day passes
- **THEN** the daemon sends no release request

#### Scenario: Versions are shown side by side

- **GIVEN** the user turned the check on
- **WHEN** the daemon checks the releases
- **THEN** the panel shows the installed and the latest version of `metaboxd` and of the core side by side

### Requirement: AC-82 A release is installed from the panel

Installing a release from the panel: `metaboxd` from the project feed; sing-box-extended from its GitHub release, checked by the published hash (the feed sources of other cores arrive with roadmap item 1). The core is installed through the Apply protocol: confirmation window, healthcheck, rollback to the previous binary. The panel survives its own update: the session and the open screen are kept across the daemon restart. The download goes to a temporary directory, not to the overlay.

#### Scenario: A core that fails the healthcheck is rolled back

- **GIVEN** a new core release is installed from the panel
- **WHEN** the healthcheck fails after the install
- **THEN** the previous binary is restored

#### Scenario: The panel survives its own update

- **GIVEN** the user updates `metaboxd` from the panel
- **WHEN** the daemon restarts
- **THEN** the session and the open screen are kept
