## ADDED Requirements

### Requirement: AC-80 A static lease is managed from the Devices screen

A static lease SHALL be created, changed and removed from the "Devices" screen for one MAC: the daemon writes the `host` section of UCI `dhcp` with name, address, MAC and tag, restarts dnsmasq and restores the section when the write or the restart fails; a section that lists several MACs, or a MAC that appears twice, is refused and left to LuCI. A concurrent edit of UCI `dhcp` is detected and refused, not overwritten. Pools, dnsmasq options and IPv6 are not edited. The AC-62 warning about a dynamic lease disappears for a pinned device.

#### Scenario: A lease is created for one MAC

- **WHEN** the user pins a device on the "Devices" screen
- **THEN** the daemon writes the `host` section of UCI `dhcp` with name, address, MAC and tag and restarts dnsmasq

#### Scenario: A failed restart restores the section

- **GIVEN** the dnsmasq restart fails after the write
- **WHEN** the lease is saved
- **THEN** the daemon restores the previous `host` section

#### Scenario: A section with several MACs is refused

- **GIVEN** a `host` section that lists several MACs
- **WHEN** the user edits its lease
- **THEN** the edit is refused and the section is left to LuCI

#### Scenario: A concurrent edit is refused

- **GIVEN** UCI `dhcp` changed after the panel read it
- **WHEN** the user saves a lease
- **THEN** the save is refused and nothing is overwritten
