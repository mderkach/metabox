# Routing Rules Specification

## Purpose

The list of routing rules in the panel: what a rule refers to, its name, its hit count and its deletion.

## Requirements

### Requirement: AC-9 A rule references a connected rule set

A routing rule SHALL be able to reference any connected rule set, and this is reflected in the applied config.

#### Scenario: A rule set added in the form lands in rule_set

- **GIVEN** a rule open in the rule form
- **WHEN** a rule set is added
- **THEN** the rule set is in `rule_set` of the node and the rest of the rule is untouched

#### Scenario: A rule with a rule set reaches the runtime

- **GIVEN** a config whose rule references a local rule set, applied on the test bench
- **WHEN** the service restarts
- **THEN** the running sing-box lists the rule with the rule set

### Requirement: AC-46 A rule shows its hit count

A rule in the list SHALL show how many times it matched. The counter is kept by the daemon from the connection stream: neither sing-box nor its Clash API returns such a number. The counter lives as long as the daemon lives, and its restart resets the count — the panel says so directly rather than presenting zero as "the rule is dead".

#### Scenario: Each connection is counted once

- **GIVEN** the daemon reads the connection stream
- **WHEN** the same connection appears in several snapshots
- **THEN** its rule gets one hit

#### Scenario: A rule the core does not observe is not zero

- **GIVEN** rules that do not end the iteration or send no traffic to an outbound
- **WHEN** the daemon counts hits
- **THEN** such rules are marked as not observable

#### Scenario: The daemon serves the counts

- **GIVEN** a running counter
- **WHEN** the panel requests rule hits
- **THEN** the daemon returns the counts by rule

#### Scenario: The rules list shows the count

- **GIVEN** rule hits from the daemon
- **WHEN** the rules screen opens
- **THEN** the row shows the count of its rule

#### Scenario: An unobservable rule is "not visible"

- **GIVEN** a rule the core does not show in the connection list
- **WHEN** the rules screen opens
- **THEN** its row shows a dash with an explanation, not zero

#### Scenario: A daemon restart warns that counts start over

- **GIVEN** the daemon restart action
- **WHEN** the user starts it
- **THEN** the confirmation says that rule hit counts start over

### Requirement: AC-86 A routing rule has a name

A routing rule SHALL have a name: the line comment right above the rule object in `route.rules` (`// TV through VPN`), since the fork has no name field on a rule. The rule form has a "Name" field that writes, replaces and, when emptied, removes that comment without touching the rest of the text, and the name moves and is deleted together with its rule. A rule without a name is labelled by its content: the main condition (a source device by its device label) and the outbound or action, "geosite-ru → direct". The rules list, the rule panel and the Apply summary call a rule by its name or that label, the number going second. A rename alone is a change: the Apply summary reports it as its own item ("renamed from … to …") and the rules list marks the row as changed. Decision in [ADR-0070](../../../docs/adr/ADR-0070-name-route-rules-with-a-line-comment-above-the-rule.md).

#### Scenario: A rename alone is one summary item

- **GIVEN** a draft whose only change is a rule rename
- **WHEN** the Apply summary is shown
- **THEN** it reports the rename as one item of its own, with the old and the new name

### Requirement: AC-65 Deletion is confirmed

Deleting a rule or a rule set SHALL require confirmation or is cancelled.

#### Scenario: A rule is deleted after confirmation

- **GIVEN** a rule open in the editor
- **WHEN** the user deletes it and confirms
- **THEN** the rule is removed from the draft and the neighbours are untouched

#### Scenario: Cancelling keeps the rule

- **GIVEN** a rule deletion waiting for confirmation
- **WHEN** the user cancels
- **THEN** the rule stays

#### Scenario: A rule set is removed after confirmation

- **GIVEN** a rule set referred to by a rule
- **WHEN** the user removes it
- **THEN** the confirmation names the rules that refer to it, and confirming removes the set

#### Scenario: Cancelling keeps the rule set

- **GIVEN** a rule set removal waiting for confirmation
- **WHEN** the user cancels
- **THEN** the rule set stays
