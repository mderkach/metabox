# Setup Specification

## Purpose

Getting metabox onto a router and keeping it current: migration from a previous routing setup.

## Requirements

### Requirement: AC-67 Migration from the previous routing setup

Migration from a previous sing-box routing setup SHALL be described by a switch and rollback runbook and run on the test bench; steps that touch the previous setup cannot be run on the test bench, they are repeated on the router during the switch. The package installs while the previous routing service is running, without touching its dataplane and ports, while the metabox sing-box service is disabled. If the "Devices" screen (AC-61) is not ready by the switch, the ACL source list is moved from the previous setup by editing UCI over SSH — acceptable temporarily (OQ-17).

#### Scenario: The package stays off next to the previous setup on the test bench

- **GIVEN** another service holds an `ip rule` and a routing table with the dataplane numbers
- **WHEN** a disabled metabox service is started
- **THEN** the foreign rule and table stay and no metabox chains appear

#### Scenario: The switch on the router

- **GIVEN** the router on the previous routing service
- **WHEN** the switch and rollback runbook is followed
- **THEN** the steps that touch the previous setup are repeated on the router
