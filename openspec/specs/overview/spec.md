# Overview Specification

## Purpose

The Overview screen: live traffic, the summary of connections, device readings and the runtime history the daemon keeps.

## Requirements

### Requirement: AC-10 Overview shows live traffic and a summary of the connection snapshot

Overview SHALL show up/down traffic in real time, counters, memory and service state. It also shows a summary of the live connection snapshot: rule action, network type, top proxy nodes and LAN devices, number of opened connections per minute and latency of the nodes selected by groups. The summary is computed by the panel from the snapshot and marked as computed (UX-8); the summary has no history of its own — it describes the snapshot, not a period. Without live connections the summary cards say there are none, and without groups with a selected node the latency card says so. Traffic and board readings history — AC-37.

#### Scenario: Speed comes from the stream

- **GIVEN** a traffic sample in the runtime stream
- **WHEN** the overview opens
- **THEN** the speed tiles show the up and down speed of the sample, not a cumulative counter

#### Scenario: Connection count comes from the snapshot

- **GIVEN** a connection snapshot of seven connections
- **WHEN** the overview opens
- **THEN** it shows seven connections

#### Scenario: The snapshot summary

- **GIVEN** a live connection snapshot
- **WHEN** the overview opens
- **THEN** the summary shows the rule actions, the network types, the top proxy nodes and the top LAN devices of that snapshot

#### Scenario: The summary and the list read one snapshot

- **GIVEN** a connection snapshot shown in the connection list
- **WHEN** the summary is computed
- **THEN** it is computed from the same snapshot as the connection list

#### Scenario: Latency of the selected nodes

- **GIVEN** groups with selected nodes
- **WHEN** the overview opens
- **THEN** the summary shows the latency of each selected node

#### Scenario: The summary without data

- **GIVEN** no live connections and no group with a selected node
- **WHEN** the overview opens
- **THEN** the summary cards say there are no live connections and the latency card says there is no group with a selected node

### Requirement: AC-35 Overview shows device readings

Overview SHALL show device readings: load and number of cores, board temperature, used memory out of total, outward interface speed, the share of internet traffic that went through a proxy, resident memory and pid of the sing-box process, daemon memory and goroutines, router uptime. The daemon reads them from procfs and sysfs and returns them as a topic of the single stream; a missing individual source — thermal zone, default route, process — blanks its own field, not the whole topic.

#### Scenario: The daemon reads the readings from procfs and sysfs

- **GIVEN** a procfs and sysfs tree with load, memory, uptime, a thermal zone, a default route and a sing-box process
- **WHEN** the daemon reads the device
- **THEN** it returns load and cores, memory, uptime, the board temperature, the outward interface, the pid and resident memory of sing-box, and the daemon memory and goroutines

#### Scenario: A missing source blanks only its field

- **GIVEN** a tree without thermal zones and without a sing-box process
- **WHEN** the daemon reads the device
- **THEN** memory and the outward interface are still returned, and only the temperature and the process are empty

#### Scenario: The panel shows the readings as a section

- **GIVEN** a device readings topic with a temperature and a load
- **WHEN** the overview opens
- **THEN** the device readings section shows the temperature and the load

### Requirement: AC-37 The daemon keeps runtime history for its uptime

The daemon SHALL accumulate runtime history — traffic, load, temperature and board memory — and returns it via `GET /api/history`. The window equals the daemon uptime: a full ring does not drop old data but doubles the step, starting from ten seconds. History and accumulated volumes survive a page reload and closing the tab; a daemon restart resets them. A point carries no absolute time — axis labels are computed by the panel.

#### Scenario: A full ring doubles the step

- **GIVEN** a traffic ring with a ten-second step that has filled up
- **WHEN** the next sample arrives
- **THEN** neighbouring points merge and the step becomes twenty seconds

#### Scenario: The window equals the uptime

- **GIVEN** a ring that has filled up and doubled its step several times
- **WHEN** more samples are recorded
- **THEN** no old data is dropped: the points still cover the whole time since the daemon started

#### Scenario: The panel draws the whole history window

- **GIVEN** the history from `GET /api/history`
- **WHEN** the overview opens
- **THEN** the history charts cover the whole daemon uptime

#### Scenario: A new tab opens with history

- **GIVEN** a new tab where no stream frame has arrived yet
- **WHEN** the overview opens
- **THEN** the traffic chart is drawn from the daemon history
