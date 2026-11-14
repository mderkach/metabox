# Logs Specification

## Purpose

The sing-box log in the panel.

## Requirements

### Requirement: AC-63 The log screen

The log screen SHALL show the tail of the sing-box log as a stream, filters by level and clears the log; rotation is done by the service, not by a separate script.

#### Scenario: The tail is filtered by level

- **GIVEN** log lines of several levels
- **WHEN** the tail is read with a level
- **THEN** only that level and above come back, the last lines kept

#### Scenario: The stream continues the tail

- **GIVEN** the log screen with a tail
- **WHEN** stream lines arrive
- **THEN** they are appended under the tail

#### Scenario: The level goes to both the tail and the stream

- **GIVEN** the log screen
- **WHEN** the user picks a level
- **THEN** the tail request and the stream both carry it

#### Scenario: Clear hides earlier lines

- **GIVEN** a log with lines
- **WHEN** the log is cleared
- **THEN** the earlier lines are not shown

#### Scenario: Rotation is not a script of metabox

- **GIVEN** the router running the package
- **WHEN** the sing-box log grows
- **THEN** it is rotated by the service and no separate script of metabox rotates it
