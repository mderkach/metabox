## ADDED Requirements

### Requirement: AC-29 Config writes are atomic

Config writes SHALL be atomic: interrupting the process or power during a write does not leave a corrupted or half-written file.

#### Scenario: An interrupted write leaves a whole file

- **WHEN** the process or power is interrupted during a config write
- **THEN** the config file is neither corrupted nor half-written
