# Service Specification

## Purpose

The sing-box service and the panel daemon as processes: start, restart, state, the crash reason, and what the panel does while sing-box is down or differs from the schema.

## Requirements

### Requirement: AC-17 One command starts the daemon with the embedded panel

The daemon SHALL start with one command, serves the embedded UI and answers the REST API.

#### Scenario: The built panel ends up in the binary

- **GIVEN** a built panel
- **WHEN** `make daemon` builds the daemon
- **THEN** the built SPA is embedded in the daemon binary

#### Scenario: The daemon serves the panel shell for any panel address

- **GIVEN** the embedded panel
- **WHEN** a browser asks for `/` or an address that exists only in the panel router
- **THEN** the daemon answers with `index.html`

### Requirement: AC-16 Service restart goes through procd

Service restart SHALL be done via procd and works correctly when the service is already stopped.

#### Scenario: Restart calls the init script

- **GIVEN** the sing-box service
- **WHEN** the daemon restarts it
- **THEN** it calls the init script with `restart`, so procd owns the service

#### Scenario: Restart of a stopped service

- **GIVEN** the sing-box service is stopped on the router
- **WHEN** the service is restarted from the panel
- **THEN** sing-box comes up and the panel shows it running

### Requirement: AC-87 The panel restarts its own daemon

Overview SHALL restart the panel daemon itself, next to the sing-box service controls, after a confirmation that says the panel goes silent for a few seconds and that history the daemon keeps in memory (charts, rule hit counts) starts over. The daemon answers before it stops and launches the restart through its init script detached from its own process; the panel waits for a new daemon process, reconnects the runtime stream and refetches its data without a page reload. A daemon that does not come back is reported by the unavailability banner.

#### Scenario: Restart asks first

- **GIVEN** the overview screen
- **WHEN** the user presses the panel restart
- **THEN** a confirmation says the charts and rule hit counts start over, and cancelling it sends nothing

#### Scenario: The daemon answers before it restarts

- **GIVEN** a restart request
- **WHEN** the daemon gets it
- **THEN** it answers the request and launches the restart through its init script

#### Scenario: The restart script runs detached

- **GIVEN** the daemon launches its init script for a restart
- **WHEN** procd stops the daemon
- **THEN** the script runs in its own session and is not stopped with the daemon

#### Scenario: The panel waits for a new daemon process

- **GIVEN** a launched restart after which the old process may still answer
- **WHEN** the panel polls the daemon
- **THEN** it treats the daemon as back only when a new daemon process answers

#### Scenario: The runtime stream reconnects to the new process

- **GIVEN** a closed runtime stream
- **WHEN** a new daemon process answers
- **THEN** the stream is opened again at once

#### Scenario: A daemon that does not come back

- **GIVEN** a launched restart after which the daemon stays silent
- **WHEN** the wait ends
- **THEN** the unavailability banner reports that the daemon is unavailable

### Requirement: AC-27 The panel works with sing-box down

With sing-box stopped or crashed, the panel SHALL open, shows the service state and the error, allows editing the config and starting the service.

#### Scenario: A crashed service shows its error

- **GIVEN** a crashed sing-box service
- **WHEN** the panel shows the service
- **THEN** it shows the crashed state, the binary output as is and a start button

#### Scenario: The service is started from the panel

- **GIVEN** a crashed service
- **WHEN** the user presses start
- **THEN** the daemon gets `start` and the panel shows the new state from the response

#### Scenario: Start of a stopped service

- **GIVEN** a stopped service
- **WHEN** the start action is sent to the daemon
- **THEN** the init script gets `start` and the response says the service is running

#### Scenario: The config is edited while sing-box is down

- **GIVEN** sing-box stopped on the device
- **WHEN** the panel opens
- **THEN** the config editor opens and an edit goes into the draft

### Requirement: AC-28 A schema drift warning

If the installed binary version differs from the schema the daemon was built with, the UI SHALL show a warning about it.

#### Scenario: A binary older than the schema

- **GIVEN** an installed binary older than the schema
- **WHEN** the panel loads the service state
- **THEN** it warns that a field from the form will not pass validation and names both versions

#### Scenario: A binary newer than the schema

- **GIVEN** an installed binary newer than the schema
- **WHEN** the panel loads the service state
- **THEN** it shows a warning that names the binary version

#### Scenario: Matching versions

- **GIVEN** an installed binary of the schema version
- **WHEN** the panel loads the service state
- **THEN** no warning is shown

#### Scenario: The daemon reads the binary version

- **GIVEN** an installed sing-box binary
- **WHEN** the daemon reads its build
- **THEN** it gets the version

### Requirement: AC-36 A sing-box process outside the managed service is told apart

The panel SHALL tell apart "the sing-box process is owned by the service the daemon manages" and "sing-box is running, but brought up by another service". In the second case the state is shown as running, and service commands are not offered: they refer to another process.

#### Scenario: The daemon reports who owns the process

- **GIVEN** the service owns the process, or a process runs outside the service, or there is no process
- **WHEN** the panel reads the service state
- **THEN** the state is running and managed, running and not managed, or stopped, respectively

#### Scenario: The panel offers no commands for a foreign process

- **GIVEN** a sing-box process that the service did not start
- **WHEN** the panel shows the service state
- **THEN** the state is running and no service command is offered

### Requirement: AC-48 sing-box runs as a service of the metabox package

sing-box SHALL be started by a service from the metabox package: a procd instance with `-c` and `-D` pointing to the config directory, an open files limit and `respawn`. The daemon manages only this service, procd instance `sing-box`, and has no setting to point it at another init script; start order is dnsmasq, fw4, the sing-box service, metaboxd, so that the replay of the transaction on start does not touch the service before the network is up. Verified on the test bench; on the router — after the switch (AC-67).

#### Scenario: The daemon reads the named instance

- **GIVEN** the `metabox-singbox` service with the procd instance `sing-box` and other instances
- **WHEN** the daemon reads the service state
- **THEN** it asks procd for the instance `sing-box` and ignores the others

#### Scenario: procd brings the process back

- **GIVEN** a running sing-box on the test bench
- **WHEN** the process is killed with `kill -9`
- **THEN** procd starts it again and a listed client gets connections through it

### Requirement: AC-55 The crash reason is read from a log file too

The sing-box crash reason SHALL be read also when `log.output` points to a file, not only from `logread`.

#### Scenario: The reason comes from the log file

- **GIVEN** a config with `log.output` set to a file and a crash message in that file
- **WHEN** the daemon reads the last failure of sing-box
- **THEN** the reason is the message from the file

### Requirement: AC-56 Service state comes from the named procd instance

The service state SHALL be determined by its procd instance `sing-box`, not by the first live instance of the service; a state read error carries a code per [ADR-0022](../../../docs/adr/ADR-0022-report-the-apply-failure-step-as-a-code.md), and the panel translates it.

#### Scenario: Another live instance does not count

- **GIVEN** a service with a live instance other than `sing-box` and a stopped `sing-box`
- **WHEN** the daemon reads the service state
- **THEN** the state is the state of `sing-box`

#### Scenario: A read failure is reported

- **GIVEN** procd does not answer or returns an error
- **WHEN** the daemon reads the service state
- **THEN** it reports an error with a code instead of a state
