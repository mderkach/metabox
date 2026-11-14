# Non-functional Requirements Specification

## Purpose

The properties the daemon and the panel keep across features: independence of the panel from sing-box, responsiveness under load, write atomicity, the resource budget, the duration of Apply and accessibility. The NFR-2, NFR-4 and NFR-5 thresholds are guidelines and must be confirmed by measurement. On BPI-R4 Pro they are reachable with margin; they are set so that the architecture does not have to be rewritten for weak hardware. NFR-6 is not confirmed by a run either: the `jsx-a11y` set in lint covers roles and labels, but not contrast and keyboard paths.

## Requirements

### Requirement: NFR-1 The panel does not depend on sing-box working

The daemon SHALL start and serve the UI with sing-box stopped, crashed or misconfigured. The UI tells apart "the service is down" and "the panel is unreachable"

#### Scenario: The panel says the daemon is not responding

- **GIVEN** the daemon does not answer
- **WHEN** the panel polls its status
- **THEN** a live region announces that the daemon is not responding, and the service dot shows "unknown" instead of the last known state

#### Scenario: The panel names a crashed service

- **GIVEN** the daemon answers and reports that sing-box crashed
- **WHEN** the operator opens Overview
- **THEN** the verdict says sing-box is not working and links to the logs

#### Scenario: The panel tells a silent sing-box from a lost daemon link

- **GIVEN** Overview with live streams
- **WHEN** only the traffic stream stalls, or both the traffic and the device streams stall
- **THEN** the first case says sing-box is silent, the second says there is no link to the daemon

### Requirement: NFR-2 Responsiveness under load

A config with up to 500 rules and up to 5000 active connections SHALL not block the interface; the Connections stream is aggregated on the daemon side, long lists are virtualized; no main thread blocks longer than 100 ms

#### Scenario: A tick of 5000 connections fits the budget

- **GIVEN** a snapshot of 5000 connections
- **WHEN** the panel parses it, applies it on the Connections screen and sorts the rows by a numeric or a text column
- **THEN** each step fits its time budget

### Requirement: NFR-3 Write atomicity

The config SHALL be written through a temporary file with `fsync` and an atomic `rename`; file corruption on power failure is ruled out

#### Scenario: An atomic write leaves only the target file

- **GIVEN** a config directory
- **WHEN** the config is written
- **THEN** the directory holds only the config file with the requested permissions, and the directory `fsync` succeeds

#### Scenario: A failed write keeps the old config

- **GIVEN** a config on disk and a directory that refuses writes
- **WHEN** a new config is written
- **THEN** the write fails and the old config is unchanged

### Requirement: NFR-4 Daemon resource budget

Steady-state RSS ≤ 64 MB, idle CPU usage ≤ 1% of one core

#### Scenario: The budget is measured on the router

- **GIVEN** the packaged daemon running on the router with no panel open
- **WHEN** its RSS and CPU usage are read after it settles
- **THEN** RSS is at most 64 MB and CPU usage at most 1% of one core

### Requirement: NFR-5 Apply duration

The full Apply cycle SHALL fit into 15 seconds on the target hardware; the confirmation window before automatic rollback is 60 seconds by default; the daemon's `-confirm-window` flag sets it, and `GET /api/status` reports it as `confirm_window_seconds`

#### Scenario: The confirmation window is set by the flag and reported

- **GIVEN** the daemon started with a confirmation window
- **WHEN** a client reads `GET /api/status`
- **THEN** `confirm_window_seconds` holds that window, and without the flag it is 60

#### Scenario: An unconfirmed Apply rolls back when the window ends

- **GIVEN** an applied config that is not confirmed
- **WHEN** the confirmation window ends
- **THEN** the previous config is restored

### Requirement: NFR-6 Interface accessibility

Target — WCAG 2.2 AA. Checked scope: contrast of text and meaningful elements at least 4.5:1, for large text and graphical cues — 3:1; every action is doable from the keyboard, focus is visible; color is not the only carrier of meaning; a control has a label. Compliance is confirmed by measurement against the background the element sits on, not by lightness calculation ([ADR-0013](../../../docs/adr/ADR-0013-build-the-panel-palette-on-routing-semantics.md))

#### Scenario: The main screens pass the WCAG 2.2 AA check

- **GIVEN** Overview, Editor, Rule sets, Connections and Proxies filled with data, in the dark and the light theme
- **WHEN** axe runs the WCAG 2.2 AA rules in a real browser
- **THEN** it finds no violations

#### Scenario: Lists and the node panel work from the keyboard

- **GIVEN** a section with a node list
- **WHEN** the operator moves through the list and opens the node panel from the keyboard
- **THEN** every step is done without a pointer
