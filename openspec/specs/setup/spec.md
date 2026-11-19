# Setup Specification

## Purpose

Getting metabox onto a router and keeping it current: migration from a previous routing setup.

## Requirements

### Requirement: AC-67 The package installs disabled next to a previous routing setup

The package SHALL install while a previous sing-box routing service is running, without touching its dataplane and ports, while the metabox sing-box service is disabled.

#### Scenario: The package stays off next to the previous setup on the test bench

- **GIVEN** another service holds an `ip rule` and a routing table with the dataplane numbers
- **WHEN** a disabled metabox service is started
- **THEN** the foreign rule and table stay and no metabox chains appear
