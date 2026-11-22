## ADDED Requirements

### Requirement: AC-126 Subscription tags do not alias shared cache entries

Metabox SHALL reject a subscription provider tag that equals a rule set or endpoint tag in the proposed configuration, including a provider or endpoint tag assigned by the core from its zero-based position.

#### Scenario: A cache tag conflicts before Apply

- **GIVEN** a candidate config contains a provider and a rule set or endpoint with the same effective tag
- **WHEN** the candidate reaches Apply
- **THEN** Apply returns a localized validation failure and neither writes files nor starts a transaction
- **AND** the same check applies to JSON with comments and trailing commas

#### Scenario: The editor prevents a conflicting tag edit

- **GIVEN** the current config document contains a conflicting tag for the proposed provider, rule set, or endpoint
- **WHEN** the user adds or renames an entry through its form
- **THEN** the form shows the tag error, retains the typed value, and leaves the draft entry unchanged

#### Scenario: A subscription URL is reused

- **GIVEN** two subscriptions have a matching URL and distinct available tags
- **WHEN** the tag check evaluates the candidate
- **THEN** it accepts both subscriptions
