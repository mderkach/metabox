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

### Requirement: AC-108 The daemon reports when the core last checked each remote rule set

For every `remote` rule set of the applied config, the daemon SHALL report the copy the core keeps in its cache file: when the core last checked the address, the size of the downloaded file, and whether the copy came from the address the config names now. It reads only the record of the copy, never the list inside it, reads while the core runs and never takes the lock of the cache file, so a core start is never delayed by the daemon.

#### Scenario: A downloaded set reports its check time and size

- **GIVEN** the applied config has `experimental.cache_file` and a `remote` rule set the core has downloaded
- **WHEN** the panel asks for the cached rule sets
- **THEN** the set is reported with the time of the last check and the size of the downloaded file in bytes

#### Scenario: A not-modified answer moves the check time

- **GIVEN** the core asked the address again and the provider answered that the file has not changed
- **WHEN** the panel asks for the cached rule sets
- **THEN** the reported check time is the time of that answer and the size is unchanged

#### Scenario: A copy from another address is marked

- **GIVEN** the cached copy of a set was downloaded from an address other than the one in the applied config
- **WHEN** the panel asks for the cached rule sets
- **THEN** the set is reported as downloaded from another address

#### Scenario: No cache file in the config

- **GIVEN** the applied config has no `experimental.cache_file`
- **WHEN** the panel asks for the cached rule sets
- **THEN** every remote set is reported as kept only in the core's memory, with no time and no size

#### Scenario: A set the core has not downloaded

- **GIVEN** a remote set of the applied config has no entry in the cache file
- **WHEN** the panel asks for the cached rule sets
- **THEN** the set is reported as not downloaded

#### Scenario: An entry under the tag is not a rule set

- **GIVEN** the cache file holds data under the tag of a remote set that is neither a binary nor a JSON rule set, such as a subscription in share-link format
- **WHEN** the panel asks for the cached rule sets
- **THEN** the set is reported as unreadable, with no time and no size

#### Scenario: The core writes the cache file during the read

- **GIVEN** the core commits a write to the cache file while the daemon copies it
- **WHEN** the daemon reads its copy
- **THEN** it discards the copy and copies again, and never reports values from a copy the core changed under it

#### Scenario: The core starts while the daemon reads

- **GIVEN** the daemon is reading the cache file
- **WHEN** the routing service starts the core
- **THEN** the core opens the cache file without waiting for the daemon

### Requirement: AC-109 The panel describes a rule set by its source and use, without reading it

The panel SHALL describe each rule set by its source, as named by its config entry and the catalog, and SHALL name the route rules and the DNS rules that use it. It SHALL NOT show entry counts or sample entries, nor claim anything about the contents beyond the source: neither the daemon nor the panel reads the list.

#### Scenario: A catalog set is described by its provider and category

- **GIVEN** a remote set whose address is a category file of a catalog provider
- **WHEN** its description is shown
- **THEN** it says it is a ready list of sites, or of addresses for an address list, from that provider's catalog, and gives the category as the provider names it, without interpreting it

#### Scenario: A set outside the catalog is described by its address

- **GIVEN** a remote set whose address is not a catalog file
- **WHEN** its description is shown
- **THEN** it says the core downloads the list from the host of its address, gives the file name, and claims nothing about its contents

#### Scenario: The rules that use the set are named

- **GIVEN** a set referenced by a route rule and by a DNS rule
- **WHEN** its description is shown
- **THEN** both rules are named, each as a route rule or a DNS rule

#### Scenario: An unused set says so

- **GIVEN** a set no route rule and no DNS rule references
- **WHEN** its description is shown
- **THEN** it says no rule in the draft uses the set

#### Scenario: No counts and no samples

- **GIVEN** any rule set
- **WHEN** its description is shown
- **THEN** it has no number of entries and no sample sites or addresses

### Requirement: AC-110 The rule sets screen shows a rule set's description and freshness

Each row of the rule sets screen SHALL expand to show the AC-109 description and, for a remote set, the AC-108 check time and size, with the reason when the daemon could not get them, never as zero. The "Updated" and "Size" columns of a remote row SHALL show the same check time and size. The screen SHALL open with a given rule set expanded when its address names that set, so other screens can link to one rule set.

#### Scenario: A remote set shows its check time and size

- **GIVEN** a remote set the core has downloaded
- **WHEN** the user expands its row
- **THEN** the row shows the description, when the core last checked the address and the size of the file, and its "Updated" and "Size" columns show the same

#### Scenario: A remote set without a cache shows the reason

- **GIVEN** a config without `experimental.cache_file`
- **WHEN** the rule sets screen opens
- **THEN** the time and size of a remote set say that the core keeps it only in memory

#### Scenario: A copy from another address is marked

- **GIVEN** a remote set whose cached copy came from another address
- **WHEN** the user expands its row
- **THEN** the row says the copy was downloaded from another address

#### Scenario: A set added in the draft is not downloaded yet

- **GIVEN** a remote set that is in the draft and not in the applied config
- **WHEN** the rule sets screen opens
- **THEN** the set is shown as not downloaded until the config is applied

#### Scenario: The daemon cannot be asked

- **GIVEN** the request for the cached rule sets fails
- **WHEN** the user expands a remote set's row
- **THEN** the row shows its description and usage and says the check time and size could not be loaded, with a way to retry

#### Scenario: A link opens one rule set

- **GIVEN** an address of the rule sets screen that names a rule set present in the config
- **WHEN** the screen opens
- **THEN** that set's row is expanded and in view

#### Scenario: A link to a missing rule set opens the screen

- **GIVEN** an address of the rule sets screen that names a rule set absent from the config
- **WHEN** the screen opens
- **THEN** the screen opens with every row collapsed

#### Scenario: The row expands from the keyboard

- **GIVEN** the rule sets screen
- **WHEN** the user moves focus to a row's expand control and presses Enter or Space
- **THEN** the row expands and a screen reader announces it as expanded
