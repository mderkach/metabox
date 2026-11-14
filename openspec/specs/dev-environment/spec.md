# Dev Environment Specification

## Purpose

The development environment and the test bench: the dev container, the Apply cycle on the bench without a router, and the CI integration run on a bench built from the same files.

## Requirements

### Requirement: AC-20 One command brings up the dev environment

`.devcontainer` SHALL bring up with one command the frontend with HMR, the Go daemon and the target environment with sing-box-extended.

#### Scenario: The environment comes up with one command

- **GIVEN** a checkout of the repository
- **WHEN** `make up-dev` runs
- **THEN** the dev server with HMR, the daemon and the target environment with sing-box-extended come up

#### Scenario: The dev container starts the same services

- **GIVEN** the editor opens the repository in the dev container
- **WHEN** the container starts
- **THEN** the service with the frontend and the daemon and the service with the target environment run

### Requirement: AC-21 The Apply cycle runs on the test bench

The full Apply cycle SHALL run inside the environment, including `sing-box check`, restart and healthcheck — without a physical router.

#### Scenario: The full cycle passes without a router

- **GIVEN** the test bench with a running sing-box and no physical router
- **WHEN** a config change is applied
- **THEN** `sing-box check`, the restart and the healthcheck pass and the change is in the running sing-box

### Requirement: AC-22 CI builds the target environment from the bench files

The target environment in CI SHALL be built from the same test bench files as locally, and the integration run happens on it. The base differs: CI has no device firmware, it uses a public OpenWrt rootfs of the same branch and its own architecture.

#### Scenario: The integration job runs on the bench

- **GIVEN** the `integration` job of CI with a public OpenWrt rootfs as the base
- **WHEN** it brings up the target from the same `.devcontainer/docker-compose.yml` as the local bench
- **THEN** the integration checks run on that target
