## Purpose

What metabox knows about an outbound beyond the config: a human label, a server's manual latency norm, the latency history the daemon keeps and the norm it computes from it.

## ADDED Requirements

### Requirement: AC-102 The daemon keeps a latency history and a norm per server

The daemon SHALL keep, per server, the recent results of the latency checks the core makes, and hourly medians for the last day, without running checks itself. A server's norm, its usual latency, is its manual norm (AC-104), otherwise the median of the hourly medians; before the first hourly median there is no computed norm. Levels: within the norm, above it several checks in a row, no answer, above an absolute ceiling. Computed values are marked as computed. The history resets with the daemon.

#### Scenario: A new check result is recorded once

- **GIVEN** a server whose last check the daemon has already recorded
- **WHEN** the daemon reads the core again before the next check
- **THEN** no second result is recorded

#### Scenario: The norm is the median over the day

- **GIVEN** a server with hourly medians for the last day, the last hour much slower than the others
- **WHEN** its norm is computed
- **THEN** the norm is the median of the hourly medians, the slow hour does not become the norm, and the norm is marked as computed

#### Scenario: A failed check is recorded as no answer

- **GIVEN** a server with a recorded result whose result the core removed after a failed check
- **WHEN** the daemon reads the core
- **THEN** it records "no answer" for that server

#### Scenario: A vanished result after a core restart is not a failure

- **GIVEN** recorded results and a core that restarted
- **WHEN** the daemon reads the core and finds no results
- **THEN** the current value and its failure streak reset. Earlier observations remain historical and the panel shows "No measurement" until a fresh result appears

#### Scenario: The first measurement is started by the user

- **GIVEN** a server in use without a result from the current core process
- **WHEN** its latency is shown
- **THEN** the panel shows "No measurement" and offers a check for that server, including a server outside any group. After a successful check it shows the fresh value, and it shows a usual value only when a manual or computed norm exists.

#### Scenario: A manual norm wins

- **GIVEN** a server with a manual norm and a history
- **WHEN** its level is computed
- **THEN** the manual norm is used

#### Scenario: One slow check is not above the norm

- **GIVEN** a server within its norm
- **WHEN** one check is slower than the norm
- **THEN** its level stays within the norm until several checks in a row are slower

#### Scenario: The history is bounded

- **GIVEN** a server checked more times than the recent results hold, for longer than a day
- **WHEN** a new result arrives
- **THEN** the oldest recent result and the hourly medians older than a day are dropped

### Requirement: AC-104 Outbounds carry a human label and servers a manual norm

An outbound SHALL be able to carry a human label, and a server a manual latency norm. Both are kept by the daemon, keyed by tag, outside the config, and survive a daemon restart; setting them needs no Apply. A label is shown first, with the tag in small monospace type. They are edited in place on Proxies, next to a group name and in a server row; an empty value returns the tag or the computed norm. An entry whose tag is gone is kept and listed apart, where it is moved to another tag or deleted.

#### Scenario: A label is shown before the tag

- **GIVEN** a group with a label
- **WHEN** its row is shown on Overview
- **THEN** the label comes first and the tag follows in small monospace type

#### Scenario: A group label is edited in place

- **GIVEN** a group on Proxies
- **WHEN** the user presses the pencil next to its name
- **THEN** one field for the label opens in place, and Escape closes it without a change and returns focus to the pencil

#### Scenario: A server row edits the label and the usual latency

- **GIVEN** a server row on Proxies with a computed usual latency
- **WHEN** the user presses the pencil in the row
- **THEN** two fields open in place, the label and the usual latency, and the current latency stays in view

#### Scenario: A label is saved at once without Apply

- **GIVEN** an open label field with a new value
- **WHEN** the user saves it
- **THEN** the daemon stores it, no draft is created, the core is not restarted, and the row shows the label with the tag under it

#### Scenario: An empty value returns the tag and the computed norm

- **GIVEN** a server with a label and a manual usual latency
- **WHEN** the user saves both fields empty
- **THEN** the entry is removed, the row shows the tag, and the usual latency is computed again

#### Scenario: Labels survive a daemon restart

- **GIVEN** a stored label and a stored norm
- **WHEN** the daemon restarts
- **THEN** both are returned again

#### Scenario: A label for a tag that is gone

- **GIVEN** a stored label whose tag is no longer in the config
- **WHEN** the labels are listed
- **THEN** the entry is returned and marked as unused

#### Scenario: Labels without an outbound are listed apart

- **GIVEN** stored labels whose tags are gone from the config and the runtime list
- **WHEN** Proxies opens
- **THEN** a separate block lists them with their tags, and it is absent when there are none

#### Scenario: An unused label is moved to another tag

- **GIVEN** an unused entry and a tag of the config or of a subscription server without an entry
- **WHEN** the user moves the entry to that tag
- **THEN** the label and the usual latency belong to the new tag and the unused entry is gone

#### Scenario: An unused label is deleted

- **GIVEN** an unused entry
- **WHEN** the user deletes it
- **THEN** it is gone from the list, and the toast offers to undo it
