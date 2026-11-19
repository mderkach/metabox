## ADDED Requirements

### Requirement: AC-91 A rollback reports a core that did not come up

After restoring the previous config and restarting the service, the rollback SHALL wait for a new sing-box process and an answer of the Clash API of the restored config within the cycle timeout. When either does not come, the transaction closes as `rollback_failed` with the crash reason of the service, not as `rolled_back`.

#### Scenario: The restored config comes up

- **GIVEN** an apply whose healthcheck failed and a previous config that starts
- **WHEN** the rollback restores the previous config and restarts the service
- **THEN** the transaction closes as `rolled_back` only after a new process answers on the Clash API of the restored config

#### Scenario: The restored config does not come up

- **GIVEN** an apply whose healthcheck failed and a service that keeps failing after the restart
- **WHEN** the rollback restores the previous config and restarts the service
- **THEN** the transaction closes as `rollback_failed`, its reason carries the crash reason of the service, and the daemon log does not say the previous config was restored

#### Scenario: A window rollback is checked the same way

- **GIVEN** an apply left without confirmation and a service that fails after the rollback restart
- **WHEN** the confirmation window ends
- **THEN** the transaction closes as `rollback_failed`

#### Scenario: A replayed rollback is checked the same way

- **GIVEN** an unfinished apply on disk and a service that fails after the rollback restart
- **WHEN** the daemon starts and replays the transaction
- **THEN** the transaction closes as `rollback_failed`

#### Scenario: A rollback without a restart is not checked

- **GIVEN** an apply with no config backup
- **WHEN** the rollback runs
- **THEN** the service is not restarted, no healthcheck runs, and the transaction closes with `no_backup` or `lists_restored` as before
