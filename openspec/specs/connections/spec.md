# Connections Specification

## Purpose

The Connections screen: the live list of connections, closing them and exporting the snapshot.

## Requirements

### Requirement: AC-12 The Connections screen lists and closes live connections

The Connections screen SHALL show a live list of connections (host, matched rule, proxy chain, traffic, speed over the snapshot interval and connection age) and allows closing a connection.

#### Scenario: A snapshot row carries host, rule and chain

- **GIVEN** a Clash API connection snapshot
- **WHEN** the daemon parses it
- **THEN** each connection carries the host, the matched rule, the proxy chain, the traffic and the start time

#### Scenario: Speed is counted over the snapshot interval

- **GIVEN** two snapshots of one connection
- **WHEN** the panel computes its speed
- **THEN** it divides the traffic difference by the interval between the snapshots, not between timer ticks

#### Scenario: A connection is closed after confirmation

- **GIVEN** a live connection on the screen
- **WHEN** the user closes it and confirms
- **THEN** the close request goes to the runtime

### Requirement: AC-39 The connection snapshot is exported to CSV and JSON

The connection snapshot SHALL be exported to CSV and JSON with the same set of columns and the same filtering as on screen. The export uses what has already arrived in the panel and makes no separate request to the device.

#### Scenario: CSV starts with the columns

- **GIVEN** a list of connections
- **WHEN** it is exported to CSV
- **THEN** the file starts with the column header and has a row under it

#### Scenario: JSON keeps the screen columns

- **GIVEN** a list of connections
- **WHEN** it is exported to JSON
- **THEN** each row has the same columns as on screen

#### Scenario: Both formats are offered

- **GIVEN** the connections screen
- **WHEN** the user opens the export
- **THEN** CSV and JSON are offered
