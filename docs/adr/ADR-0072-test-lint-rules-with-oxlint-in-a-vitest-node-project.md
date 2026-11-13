# ADR-0072. Test lint rules with oxlint in a Vitest Node project

- Status: Proposed
- Date: 2026-10-31
- Deciders: repository owner

## Context and problem statement

Issue [#163](https://github.com/mderkach/metabox/issues/163) calls for regression coverage of the frontend's local FSD boundary rule. Linting the repository checks its current imports, but cannot prove that forbidden imports are rejected or permitted imports remain accepted. The rule also checks public entry points on disk, so its behaviour depends on both parsed source and filesystem state.

The [PRD](../PRD.md), section 9, fixes oxlint as part of the frontend stack. The workspace pins oxlint to `1.81.0`, which exports `RuleTester` from `oxlint/plugins-dev`. [ADR-0064](./ADR-0064-run-browser-tests-in-a-vitest-browser-project-next-to-jsdom.md) keeps test environments in one Vitest configuration and runner. The jsdom projects load application setup, including browser stubs and mocks; those fixtures do not serve lint tooling.

This decision covers how local lint rules are tested and included in routine verification. It does not change FSD policy, product requirements or runtime behaviour.

## Decision drivers

- Exercise the actual oxlint parser and rule integration, including filesystem-dependent checks.
- Detect false positives as well as missed violations.
- Reuse installed tools and existing test, watch, hook and CI entry points.
- Keep tooling tests independent of application and browser setup.
- Preserve the budget project's isolated execution order.

## Considered options

1. **Use oxlint's `RuleTester` in a Vitest Node project**: runs source samples through the installed linter and uses Vitest's reporting and lifecycle. It adds no dependency or runner, but couples the tests to oxlint's evolving JavaScript plugin API. **Chosen**.
2. **Call rule visitors with hand-built AST nodes**: small, fast unit checks can isolate visitor logic, but do not verify the parser's node shapes, traversal or reporting integration. Filesystem fixtures alone cannot close that gap. **Rejected** as the regression test strategy.
3. **Use a separate Node runner or CLI-only fixture tests**: both can exercise real parsing; CLI fixtures also cover configuration loading. They require a separate execution path or more subprocess and diagnostic handling for every case. **Rejected** for the rule suite; normal repository lint remains a configuration check.
4. **Keep repository lint as the only check**: adds no maintenance cost, but has no deliberate invalid samples and cannot guard rejection behaviour. **Rejected**.

## Decision outcome

- Import `RuleTester` from `oxlint/plugins-dev` and connect its `describe` and `it` hooks to Vitest. Use the existing oxlint and Vitest dependencies, with no new test framework or package.
- Add a `tooling` project in `apps/web/vite.config.ts`, with `environment: 'node'` and `include: ['tools/**/*.test.js']`. It has no application setup file and runs in the group before `budget`, alongside `unit`. This extends ADR-0064's one-runner approach without changing its browser project.
- Include `tooling` in both `test` and `test:watch`. The existing `make test`, pre-push hook and CI test command then cover it without a separate hook or CI job.
- Keep source samples and temporary filesystem fixtures in `apps/web/tools/fsdBoundaries.test.js`. Create the files and public indexes needed by each case, check accepted and rejected imports through the real parser, and remove the fixture tree through the test lifecycle. Hand-built AST checks do not replace these tests.
- Test the existing boundary policy, including real shared barrels and single-file entries, generated-source restrictions and test, mock and development exceptions. Any exact benchmark exception authorized by #163 stays scoped to that exception; this decision grants no broader exemption.

## Consequences

### Positive

- Rule regressions appear in the same local and CI test results as application regressions.
- Parser behaviour and public-entry filesystem checks are covered together.
- Tooling cases require neither jsdom application fixtures nor a downloaded browser.

### Negative

- The JavaScript plugin API is alpha; an oxlint upgrade can require test harness changes. The pinned version and routine tooling suite make that coupling visible.
- Filesystem fixtures need cleanup and deliberate isolation to avoid order-dependent results.

### Neutral or deferred

- Browser scenarios and application test environments keep their existing responsibilities.
- Changes to FSD policy and testing unrelated tooling are outside this decision.

## Compatibility, migration and rollback

No product behaviour, persisted data or client contract changes; no migration is required. Rollback removes the tooling test file, its Vitest project and its selection in the test scripts. It does not require reverting boundary-rule fixes or changing product code.

## Validation

- `pnpm --filter web exec vitest run --project tooling` reports accepted and rejected rule cases in the `tooling` project.
- `pnpm --filter web test` includes `tooling`, `unit` and `budget`; `test:watch` selects the same projects. Budget tests remain in the later execution group.
- `pnpm lint` checks the plugin against the real repository and catches configuration-loading failures.
- `pnpm exec oxfmt --check docs/adr/ADR-0072-test-lint-rules-with-oxlint-in-a-vitest-node-project.md` checks this record's formatting.

## Links

- [PRD](../PRD.md), section 9
- [ADR-0064](./ADR-0064-run-browser-tests-in-a-vitest-browser-project-next-to-jsdom.md): one Vitest runner with separate environments
- [Unit testing guide](../../apps/web/docs/guides/testing/Unit.md)
- [Vitest configuration](../../apps/web/vite.config.ts), [test scripts](../../apps/web/package.json), [rule tests](../../apps/web/tools/fsdBoundaries.test.js)
- [Issue #163](https://github.com/mderkach/metabox/issues/163)
- [oxlint: writing tests for custom rules](https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html#writing-tests-for-custom-rules)
