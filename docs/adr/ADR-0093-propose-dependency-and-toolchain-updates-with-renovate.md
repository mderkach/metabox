# ADR-0093. Propose dependency and toolchain updates with Renovate

- Status: Accepted
- Date: 2026-11-22
- Deciders: repository owner

## Context and problem statement

Metabox pins JavaScript packages, Go modules and build tools. Finding upgrades manually takes time and leaves developers to synchronize several pins for each toolchain upgrade. The existing continuous integration workflow tests pull requests, including the web build, the two Go modules, the OpenWrt integration stand and the installable package.

## Decision drivers

- Keep every update reviewable in a pull request with the existing checks.
- Update the shared pnpm lockfile and the toolchain pins consumed by local development, containers and continuous integration.
- Limit the number of concurrent routine pull requests and preserve manual control over merging.

## Considered options

1. **Hosted Renovate.** Supports pnpm workspace catalogs, Go modules and rules that group the version pins across files. **Chosen** for coverage of both libraries and toolchains.
2. **GitHub Dependabot.** Runs natively and can propose routine pnpm version updates. Its dependency graph currently skips the two-document pnpm lockfile used here, and the toolchain pins would still need separate coordination. **Rejected** for this setup.
3. **Manual checks and updates.** Preserve direct control over timing and version selection, at the cost of regular discovery and synchronization work. **Rejected** for routine updates.

## Decision outcome

Use the Mend Renovate GitHub App with repository access scoped to Metabox. It proposes JavaScript and Go dependency updates and groups each set of Node.js, pnpm and Go toolchain pins in its own pull requests. The container's Go image tag follows the Go minor release. Keep the existing fork release workflow responsible for the routing core and its replacement modules.

Routine updates use a weekly window with at most three concurrent pull requests. npm releases have a three-day minimum age for routine updates. Major updates can get separate pull requests. Merging requires a person and the repository's existing green continuous integration check.

## Consequences

- Maintainers get reviewable updates without repeating registry and release lookups.
- The repository depends on availability of the hosted GitHub App. Full continuous integration runs consume runner time on bot pull requests.
- A passing build covers the tested scenarios. A reviewer evaluates changes to behaviour outside those scenarios.

## Compatibility, migration and rollback

Merge the repository configuration before installing the app. No version pins change during onboarding. Disable the app's access to Metabox to stop pull request creation. Existing pins and lockfiles continue to drive builds.

## Validation

- Validate [the Renovate configuration](../../.github/renovate.json) with `renovate-config-validator --strict .github/renovate.json`.
- Run [the pin check](../../.github/scripts/check-toolchain-pins.py) with `python3 .github/scripts/check-toolchain-pins.py`. [Continuous integration](../../.github/workflows/ci.yml) includes this check in the pull request verdict.
- After activation, inspect the first pull request for each toolchain and verify the changed pins and the green `checks` result before merging.

## Links

- [ADR-0016](./ADR-0016-pin-tool-versions-where-tools-read-them.md)
- [Renovate installation and onboarding](https://docs.renovatebot.com/getting-started/installing-onboarding/)
- [Dependabot pnpm support](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories#pnpm)
