# Route Explanation Specification

## Purpose

The explanation of where a connection or a domain goes and why, and how each statement in it is marked by origin.

## Requirements

### Requirement: AC-34 Every statement carries its origin

Each statement in the route explanation SHALL carry its origin — `observed`, `computed` or `unknown` — and the API returns no statements without it. The matched rule is linked to the `route.rules` node of the applied config by its index; a condition whose reason for not matching cannot be computed is marked `unknown`, not replaced with a guess. Decision — [ADR-0007](../../../docs/adr/ADR-0007-explain-route-without-own-rule-evaluator.md).

#### Scenario: The explanation links the rule by index

- **GIVEN** a connection matched by a rule of the applied config
- **WHEN** the daemon explains its route
- **THEN** the match carries the index of the rule in `route.rules`, the chain is observed and every rule carries an origin

#### Scenario: An uncomputable match is unknown with a reason

- **GIVEN** a rule whose match cannot be computed
- **WHEN** the daemon looks for the matched rule
- **THEN** the match is `unknown` and carries a reason

#### Scenario: The API returns origins

- **GIVEN** a route explanation
- **WHEN** the client requests it over HTTP
- **THEN** the match, the chain and every rule carry an origin

#### Scenario: The panel shows an unknown rule as a reason

- **GIVEN** an explanation with an unknown match
- **WHEN** the panel shows it
- **THEN** it says the rule is not determined and gives the reason

#### Scenario: An unfamiliar origin is read as unknown

- **GIVEN** an explanation with an origin the panel does not know
- **WHEN** the panel reads it
- **THEN** the origin is `unknown`
