## MODIFIED Requirements

### Requirement: AC-61 The Devices screen manages LAN devices

The "Devices" screen SHALL manage LAN devices: list, renaming, a "through the core" toggle that writes the dataplane ACL through the AC-53 confirmation window, navigation to the device's connections.

#### Scenario: The list

- **GIVEN** devices from the daemon
- **WHEN** the screen opens
- **THEN** it shows each device with its label, address, MAC, lease and network

#### Scenario: Renaming

- **GIVEN** a device on the screen
- **WHEN** the user renames it
- **THEN** the new name is sent to the daemon and shown in the list

#### Scenario: Via sing-box

- **GIVEN** a device that does not go through the core
- **WHEN** the user turns its "through the core" toggle on
- **THEN** the dataplane ACL with its MAC is sent and the confirmation window opens

#### Scenario: The daemon takes a dataplane change

- **GIVEN** a dataplane model change sent to the daemon
- **WHEN** the daemon accepts it
- **THEN** it goes through the dataplane apply with its confirmation window

#### Scenario: Navigation to connections

- **GIVEN** a device on the screen
- **WHEN** the user follows its connections link
- **THEN** the connections screen opens filtered by its address

### Requirement: AC-88 Interception subnets and exclusions from the panel

Interception subnets SHALL be managed from the panel: a subnet in the dataplane ACL is added, changed and removed with an IPv4 CIDR check, through the AC-53 confirmation window. A device inside a listed subnet can be excluded from interception: the "through the core" toggle of AC-61 writes the device MAC, and its address under a static lease, to an exclusion list of the dataplane model, and the interception chains let that traffic go direct before the source match. A device covered by a subnet is never shown as impossible to switch off.

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
- **THEN** it is shown as going through the core and its toggle can be turned off

#### Scenario: Turning off a device inside a subnet writes an exclusion

- **GIVEN** a device with a static lease inside a listed subnet
- **WHEN** its "through the core" toggle is turned off
- **THEN** its MAC and its address go into the exclusion list

#### Scenario: An excluded device goes direct on the test bench

- **GIVEN** a device excluded by MAC inside a listed subnet
- **WHEN** it opens a TCP connection to an outside address
- **THEN** the connection goes direct, not through sing-box
