## MODIFIED Requirements

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
