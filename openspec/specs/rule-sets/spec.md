# Rule Sets Specification

## Purpose

Lists of domains and addresses the routing rules refer to: the user's own lists, remote rule sets and the catalog of ready-made ones.

## Requirements

### Requirement: AC-8 Own lists live in the config

The user SHALL be able to build a custom list of domains and addresses in the UI, including one based on a provider list from AC-7. The list is stored in the sing-box config, not in the daemon state: a small one as an `inline` node in `route.rule_set`, a large one as a file in a subdirectory of the config directory under a `local` node, which is written, checked and rolled back by the Apply protocol together with the config. When the device had no config before the apply, the rollback returns the list files alone and leaves the written config in place.

#### Scenario: A list as a file passes the check on the bench

- **GIVEN** a candidate config with a `local` rule set pointing to a file in `rule-sets/`
- **WHEN** sing-box checks the candidate with and without the file
- **THEN** the check passes with the file and fails without it

### Requirement: AC-44 Remote rule sets warn about a missing cache

When connecting a `remote` rule set, the panel SHALL check whether the config has `experimental.cache_file` and, if not, explain the cost: without the cache, rebooting the router while the provider is unreachable prevents sing-box from starting at all — one missing set aborts the whole start. Enabling the section is offered as an explicit action and goes out with the same apply as the set itself; the panel does not add it on its own — the AC-2 exception stays exactly one, and it is `experimental.clash_api` from AC-31.

#### Scenario: The cache is enabled by an explicit action

- **GIVEN** a config with a remote rule set and no `experimental.cache_file`
- **WHEN** the user presses the button that enables the cache
- **THEN** the draft gets `experimental.cache_file`, the rest of the config is untouched and the warning disappears

#### Scenario: No remote sets, no warning

- **GIVEN** a config without remote rule sets
- **WHEN** the rule sets screen opens
- **THEN** there is no cache warning

### Requirement: AC-7 A catalog of ready-made rule sets

The UI SHALL have a catalog of ready-made rule sets with a choice of provider and search by category: Runet Freedom, v2fly `geosite` and `geoip`, and other sources the owner considers necessary; antifilter was removed from the list on 2026-10-09 (OQ-20), its lists are available as Runet Freedom categories. The selected category goes into the config as a `remote` rule set with a correct URL, and the provider is visible in the UI — it shows whose list the route trusts. The catalog opens without network access: a snapshot of the category list is built into the daemon. When there is network, the daemon itself checks the list against providers once a day, and the panel shows when the list was checked. It is not the only path — an address that is not in the catalog is entered by hand, and a provider can have a mirror selected, because the main address is not always reachable from Russia.

#### Scenario: A category becomes a remote rule set

- **WHEN** the user selects a category of a provider in the catalog
- **THEN** the config gets a `remote` rule set with the URL of that category and the UI shows the provider

#### Scenario: The catalog opens without network

- **GIVEN** the router has no network access
- **WHEN** the user opens the catalog
- **THEN** the category list comes from the snapshot built into the daemon

#### Scenario: An address outside the catalog is entered by hand

- **WHEN** the user enters a rule-set address that is not in the catalog
- **THEN** the address is accepted as a `remote` rule set
