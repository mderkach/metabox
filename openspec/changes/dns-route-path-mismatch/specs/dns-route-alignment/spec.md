## ADDED Requirements

### Requirement: AC-125 Routes identifies a proven DNS and traffic path mismatch

Routes SHALL identify domains or patterns for which DNS and traffic follow different paths when both paths can be established. Simple shows the finding in DNS settings, and JSON points to the related entries. A supported repair stages only the applicable DNS edit in the shared draft.

#### Scenario: A proven mismatch is visible in both Routes views

- **GIVEN** the same configuration revision shows a domain using one traffic exit and a different DNS path
- **WHEN** the user views its DNS settings in Simple or related entries in JSON
- **THEN** the finding identifies the domain, the traffic exit and the DNS path, and the JSON view points to the related entries

#### Scenario: Incomplete evidence is not presented as a mismatch

- **GIVEN** the rules or imported data do not establish one of the paths
- **WHEN** the panel evaluates the domain or pattern
- **THEN** it does not present a proven mismatch or offer a speculative repair

#### Scenario: Repair stages one reviewable DNS edit

- **GIVEN** a proven mismatch with one supported repair
- **WHEN** the user chooses to align DNS with the traffic path
- **THEN** the shared draft shows the DNS edit and preserves unrelated rules
- **AND** the running configuration changes only after the existing Apply flow

#### Scenario: A changed draft invalidates a stale repair

- **GIVEN** a mismatch notice for a prior draft revision
- **WHEN** a relevant rule changes before the user selects its repair
- **THEN** Routes rechecks the finding against the current draft and does not apply the stale edit
