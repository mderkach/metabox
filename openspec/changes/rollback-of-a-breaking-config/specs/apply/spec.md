## ADDED Requirements

### Requirement: AC-14 A config that breaks connectivity is returned automatically

A config that is known to break connectivity SHALL lead to an automatic return of the previous one and restored access without SSH intervention.

#### Scenario: The previous config comes back

- **GIVEN** a working config and a config known to break connectivity
- **WHEN** the breaking config is applied
- **THEN** the previous config returns automatically and access is restored without SSH
