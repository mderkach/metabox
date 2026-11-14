## ADDED Requirements

### Requirement: AC-6 A config built from scratch passes the check

A config built from scratch in the UI for the "VLESS/Reality + rule-based routing" scenario SHALL pass `sing-box check` without manual edits.

#### Scenario: The scenario config passes sing-box check

- **GIVEN** an empty config
- **WHEN** the user builds the "VLESS/Reality + rule-based routing" scenario in the UI
- **THEN** `sing-box check` passes on the result without manual edits
