## ADDED Requirements

### Requirement: AC-92 A cached subscription that crashes the core is dropped

When the service fails with `start provider/remote[<tag>]: restore cached outbound provider` after a rollback restart, a start or restart from the panel, or at daemon start, the daemon SHALL stop the sing-box process without removing interception, delete the cache entry of that provider from the cache file of the running config, start the service and wait for the healthcheck.

#### Scenario: The poisoned entry is dropped and the core comes up

- **GIVEN** a cache file with an entry of provider `sub` that the core cannot restore, and a service failing with that signature
- **WHEN** the rollback restart fails
- **THEN** the daemon deletes the entry of `sub`, starts the service, the core comes up, and the transaction closes as `rolled_back` with the dropped provider named in its reason

#### Scenario: The rest of the cache stays

- **GIVEN** a cache file with entries of two subscriptions and a remote rule set, one subscription poisoned
- **WHEN** the recovery runs
- **THEN** only the entry of the poisoned subscription is deleted

#### Scenario: Interception stays during the recovery

- **GIVEN** an enabled dataplane and a failing service
- **WHEN** the recovery stops the sing-box process
- **THEN** the dataplane chains, the ip rule and the dnsmasq fragment stay in place

#### Scenario: The cache id selects the bucket

- **GIVEN** a config with `experimental.cache_file.cache_id` set and a poisoned entry under that id
- **WHEN** the recovery runs
- **THEN** the entry is deleted from the bucket of that cache id and the buckets of other ids are not touched

#### Scenario: The cache path follows the config

- **GIVEN** a config with a relative `experimental.cache_file.path`
- **WHEN** the recovery runs
- **THEN** the file is resolved from the working directory of the service

#### Scenario: Recovery at daemon start

- **GIVEN** a router that booted with a poisoned cache entry and no unfinished apply
- **WHEN** the daemon starts
- **THEN** the daemon recovers the service without a user action

#### Scenario: Recovery after a restart from the panel

- **GIVEN** a poisoned cache entry
- **WHEN** the user starts or restarts the service in the panel and the core fails with the signature
- **THEN** the daemon recovers the service and the panel receives the state after the recovery

#### Scenario: Another crash is not touched

- **GIVEN** a service that fails with a reason other than the signature
- **WHEN** a trigger runs
- **THEN** the cache file is not opened and the service is not stopped

#### Scenario: A stopped service is left alone

- **GIVEN** a service the user stopped in the panel
- **WHEN** the daemon starts
- **THEN** the daemon does not start the service, does not open the cache file, and an Apply is not refused as busy

#### Scenario: A held lock stops the recovery

- **GIVEN** a cache file whose lock is still held after the sing-box process was stopped
- **WHEN** the recovery opens it
- **THEN** the file is not changed, the service is started again and the failure is reported

#### Scenario: Recovery does not repeat a provider

- **GIVEN** a cache entry that the daemon already dropped in this recovery
- **WHEN** the core fails with the signature for the same provider again
- **THEN** the recovery stops and reports the failure

### Requirement: AC-93 An unreadable cache file is moved aside

When the recovery of AC-92 cannot open the cache file as a bbolt database for a reason other than a held lock, the daemon SHALL move the file aside whole, next to it under a fixed name that replaces an earlier one, and start the service.

#### Scenario: A file that is not a database

- **GIVEN** a service failing with the signature and a cache file the daemon cannot open as a bbolt database
- **WHEN** the recovery runs
- **THEN** the file is renamed aside, the service starts without it and the daemon log names the moved file

#### Scenario: A held lock is not a broken file

- **GIVEN** a cache file whose lock is still held
- **WHEN** the recovery opens it
- **THEN** the file is not moved
