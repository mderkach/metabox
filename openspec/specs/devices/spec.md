# Devices Specification

## Purpose

LAN devices in the panel: the list, names, the per-device interception toggle, interception subnets and routing conditions by device.

## Requirements

### Requirement: AC-58 The daemon lists LAN devices

The daemon SHALL return the list of LAN devices from DHCP leases and static dnsmasq entries: address, MAC, name, name source, whether the lease is static, whether the device is online.

#### Scenario: Leases and static entries are merged

- **GIVEN** DHCP leases and static dnsmasq hosts
- **WHEN** the daemon lists devices
- **THEN** each device carries address, MAC, name, name source, whether the lease is static and whether it is online

#### Scenario: Static entries without a lease file

- **GIVEN** static hosts and no lease file
- **WHEN** the daemon lists devices
- **THEN** the static entries are still listed

### Requirement: AC-59 Custom device names

A custom device name SHALL be set in the panel, stored in the daemon state by MAC and survives its restart. Label priority: custom name, then static lease, then the name from DHCP, then IP. Decision — [ADR-0048](../../../docs/adr/ADR-0048-keep-device-names-in-the-daemon-state-and-list-devices-from-dhcp.md).

#### Scenario: A custom name wins over the static name and survives a restart

- **GIVEN** a device with a static lease name
- **WHEN** a custom name is set and the daemon restarts
- **THEN** the device carries the custom name with the custom source

#### Scenario: The label follows the priority

- **GIVEN** a device with only a DHCP name and a device with no name
- **WHEN** the panel labels them
- **THEN** the first is labelled by its DHCP name and the second by its IP

### Requirement: AC-60 The device label wherever a source is shown

Wherever the panel shows a connection source — cell and mobile card, sorting, search, facet and address parameter, overview summary, route explanation, export, rule forms — the device label from a single function SHALL be shown instead of the IP. Search finds a connection by name; the facet and the address parameter store the IP. CSV/JSON export carries both columns — device label and IP (OQ-18).

#### Scenario: Every source place uses one function

- **GIVEN** each place of the panel that shows a connection source
- **WHEN** its source is read
- **THEN** it takes the label from the single device label function

#### Scenario: Search finds a connection by device name

- **GIVEN** a connection from a named device
- **WHEN** the user searches by the device name
- **THEN** the connection is found

#### Scenario: The facet shows the name and stores the IP

- **GIVEN** the source facet
- **WHEN** a device is picked
- **THEN** the facet shows its name and the address parameter holds its IP

#### Scenario: Export carries the label and the IP

- **GIVEN** connections from a named device
- **WHEN** they are exported as CSV
- **THEN** the file carries both the device label and the source address

### Requirement: AC-61 The Devices screen manages LAN devices

The "Devices" screen: list, renaming, a "via sing-box" toggle that writes the dataplane ACL through the AC-53 confirmation window, navigation to the device's connections.

#### Scenario: The list

- **GIVEN** devices from the daemon
- **WHEN** the screen opens
- **THEN** it shows each device with its label, address, MAC, lease and network

#### Scenario: Renaming

- **GIVEN** a device on the screen
- **WHEN** the user renames it
- **THEN** the new name is sent to the daemon and shown in the list

#### Scenario: Via sing-box

- **GIVEN** a device that does not go through sing-box
- **WHEN** the user turns its "via sing-box" toggle on
- **THEN** the dataplane ACL with its MAC is sent and the confirmation window opens

#### Scenario: The daemon takes a dataplane change

- **GIVEN** a dataplane model change sent to the daemon
- **WHEN** the daemon accepts it
- **THEN** it goes through the dataplane apply with its confirmation window

#### Scenario: Navigation to connections

- **GIVEN** a device on the screen
- **WHEN** the user follows its connections link
- **THEN** the connections screen opens filtered by its address

### Requirement: AC-62 A route condition by device

A route rule condition by device SHALL be chosen from the device list and written as `source_ip_cidr`; with a dynamic lease the panel warns that the address may change.

#### Scenario: A picked device becomes a source address

- **GIVEN** the route rule form
- **WHEN** a device with a dynamic lease is picked from the device list of the source condition
- **THEN** the rule gets `source_ip_cidr` with its address and the panel warns that the dynamic lease may change it

#### Scenario: A static lease gives no warning

- **GIVEN** a device with a static lease
- **WHEN** it is picked as a rule source
- **THEN** no address change warning is shown

### Requirement: AC-88 Interception subnets and exclusions from the panel

Interception subnets SHALL be managed from the panel: a subnet in the dataplane ACL is added, changed and removed with an IPv4 CIDR check, through the AC-53 confirmation window. A device inside a listed subnet can be excluded from interception: the "via sing-box" toggle of AC-61 writes the device MAC, and its address under a static lease, to an exclusion list of the dataplane model, and the interception chains let that traffic go direct before the source match. A device covered by a subnet is never shown as impossible to switch off.

#### Scenario: A subnet list edit goes through the confirmation window

- **GIVEN** the interception subnet list
- **WHEN** the user adds, changes or removes a subnet
- **THEN** the edited list is sent and the confirmation window opens

#### Scenario: A subnet with host bits is not sent

- **GIVEN** a subnet with host bits
- **WHEN** it is entered
- **THEN** the panel names the subnet it was meant to be and sends nothing

#### Scenario: Text that is not IPv4 is rejected

- **GIVEN** text that is not an IPv4 address or subnet
- **WHEN** it is entered
- **THEN** it is not sent

#### Scenario: A device in a listed subnet can be turned off

- **GIVEN** a device inside a listed subnet
- **WHEN** the screen shows it
- **THEN** it is shown as going through sing-box and its toggle can be turned off

#### Scenario: Turning off a device inside a subnet writes an exclusion

- **GIVEN** a device with a static lease inside a listed subnet
- **WHEN** its "via sing-box" toggle is turned off
- **THEN** its MAC and its address go into the exclusion list

#### Scenario: An excluded device goes direct on the test bench

- **GIVEN** a device excluded by MAC inside a listed subnet
- **WHEN** it opens a TCP connection to an outside address
- **THEN** the connection goes direct, not through sing-box
