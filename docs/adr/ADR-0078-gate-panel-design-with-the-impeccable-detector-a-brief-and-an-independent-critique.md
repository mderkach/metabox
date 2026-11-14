# ADR-0078. Gate panel design with the Impeccable detector, a brief and an independent critique

- Status: Accepted
- Date: 2026-11-14
- Deciders: repository owner

## Summary

Work on the panel interface gets three rules. The Impeccable design detector, a rule engine that runs without a language model, scans the panel sources on pre-push and in CI and fails on a finding. A new screen, a new block of a screen or a redesign starts with a design brief that the repository owner approves before code is written. A new or changed form, component or interaction is reviewed with the Impeccable `critique` command by an agent or a person who did not write it; its findings decide, its score does not. Rejected: a scan of the rendered pages as a blocking check, a mandatory `audit` on every pull request, and a merge criterion based on the critique score. For the owner: one more pre-push and CI step of about six seconds, a brief to approve before a new screen is built, and a critique comment on pull requests that change a form or a component.

## Context and problem statement

The panel already carries Impeccable context: [`apps/web/PRODUCT.md`](../../apps/web/PRODUCT.md) and [`apps/web/DESIGN.md`](../../apps/web/DESIGN.md). The tool itself was used only when a task brief asked for it, and no rule in the canonical sources mentioned it. The outcome on 2026-11-14:

- A pull request with suggestions in the rule condition field was critiqued twice, both times by the agent that wrote it. It scored 26 and then 28 of 40, and the same pull request replaced a library component with a hand-written one against the repository's reuse principle; the critique did not and could not notice that.
- Two interface blocks were built on a wrong premise and were caught by the owner after the merge, not by any review: an action that rewrites the config to make a group switchable, and an Overview card that assumes one exit node.
- The `.impeccable` directory was ignored by git as a whole, so detector exceptions could not be shared, and worktrees of parallel agents had none.

A scan of the rendered panel was measured the same day: 175 states of the mock stand at 1280x800 and 390x844 in both themes, 700 scans, 2262 seconds. It reported 6369 findings, of which 159 are real defects with 7 root causes; the rest are false positives (a whole-row click target read as covered text, vendor styles) or documented decisions (route colours from `DESIGN.md`). A scan of the sources takes about six seconds and reports 4 findings (the Geist typeface) and 4 advisory notes in vendor files.

In scope: what is mandatory for a change visible in the panel, and which Impeccable check runs automatically. Out of scope: the content of the design system and the fixes of the defects found.

## Decision drivers

- A check that runs without a person or a language model is cheap and repeatable; a model's review is neither.
- A wrong premise is cheaper to catch in a brief than in code, and only the owner knows what a block is for.
- A review by the author of a change finds less than a review by someone else.
- A gate must be green on `main` the day it is introduced, or it will be switched off.
- Rules live in the canonical sources, so every agent client and a person follow the same ones.

## Considered options

1. **Detector on sources as a gate, a brief before a new screen, an independent critique as a pull request comment.** The baseline is clean after two recorded exceptions; the two human steps apply only where a premise or an interaction is at stake. Drawbacks: the source scan does not see rendered layout; a critique costs model usage on every pull request that changes a form or a component. **Chosen.**
2. **Four levels of change, each with its own set of commands, including `audit` before every pull request.** Drawbacks: agents would argue about the level of a change; `audit` overlaps with the accessibility test, the bundle budget and the end-to-end scenarios that CI already runs. **Rejected.**
3. **A scan of the rendered pages as a blocking CI step.** It sees contrast, overflow and heading order. Drawbacks: 6369 findings on `main` with 97.5% noise; the command-line URL scan fails on every screen that keeps a stream open and covers the dark theme only; an in-page scan needs the engine's browser bundle fetched on the runner. **Rejected for now**; a ratchet on `low-contrast` and `skipped-heading` is a separate task once the exceptions are recorded.
4. **A critique score as a merge criterion.** Drawbacks: the score moved by two points between runs of the same reviewer on a reworked change; it measures nothing the owner can act on. **Rejected.**
5. **Keep Impeccable as an optional tool named in task briefs.** No cost. Drawbacks: the rule exists only in one agent's memory; the failures above repeat. **Rejected.**

## Decision outcome

- `impeccable` 4.8.0 is a development dependency of `apps/web`, pinned exactly. `pnpm --filter web check:design` runs `impeccable detect src`; exit code 2 on a finding fails the pre-push job `design` and the CI job `web`.
- Detector exceptions live in `apps/web/.impeccable/config.json`, written by `impeccable ignores` with a `--reason`. Two are recorded: vendor shadcn files, and the Geist typeface until it is replaced. Critique history, live-mode sessions, the generated `design.json` and `config.local.json` stay out of git.
- [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) states the three rules; the review checklist repeats the two that a person checks.
- The brief is produced with `/impeccable shape`, posted in the issue, and names the question of the user the block answers. The owner approves it there.
- The critique is run with `/impeccable critique` on the mock stand at desktop width and 375 px by someone other than the author. Its findings are a pull request comment; a finding that is not fixed becomes an issue.

## Consequences

### Positive

- A design-system violation in the sources fails locally in seconds.
- A screen's purpose is agreed before it is built.
- The author of a change no longer reviews it alone.

### Negative

- The Impeccable skill is installed per user, not vendored in the repository: a client without it cannot follow the brief and critique rules, only the detector.
- The source scan does not see rendered defects. The contrast and heading defects found on 2026-11-14 would pass it.
- A critique on every pull request with a changed form or component costs model usage and time.
- A new development dependency whose rule set changes with its version; an update is a deliberate change that may add findings.

### Neutral or deferred

- A blocking scan of rendered pages, and running `audit` on a whole screen before a release, are not introduced.
- Impeccable's edit-time hooks are not part of the repository setup; a developer may enable them locally.

## Risks and mitigations

| Risk                                                | Likelihood and impact       | Mitigation                                                                  |
| --------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| An exception is added to silence a real finding     | medium, defect ships        | every exception carries a reason and is reviewed as a diff of `config.json` |
| The critique is skipped because it is not automated | medium, rule becomes formal | the review checklist item; the coordinator runs it before the merge         |
| The brief step slows a small change                 | low, delay                  | it applies to a new screen, block or redesign only                          |
| A detector update adds findings and fails `main`    | low, red build              | exact pin; the update is its own pull request                               |

## Compatibility, migration and rollback

No product behaviour changes. Rollback: remove the `design` pre-push job, the CI step, the `check:design` script and the dependency; the rules in `AGENTS.md` can stay without the detector.

## Validation

- `pnpm --filter web check:design` exits 0 on `main`; with a gradient text class added to a component it reports a finding.
- `.github/workflows/ci.yml`, job `web`, and `lefthook.yml`, job `design`, run that script.
- `git check-ignore apps/web/.impeccable/config.json` prints nothing; `git check-ignore apps/web/.impeccable/design.json` prints the path.
- Governed files: `apps/web/AGENTS.md`, `apps/web/docs/guides/ReviewChecklist.md`, `apps/web/.impeccable/config.json`, `apps/web/package.json`, `lefthook.yml`, `.github/workflows/ci.yml`, `.gitignore`.

## Links

- [`apps/web/PRODUCT.md`](../../apps/web/PRODUCT.md), [`apps/web/DESIGN.md`](../../apps/web/DESIGN.md): the context Impeccable reads.
- [ADR-0073](./ADR-0073-share-agent-skills-and-keep-native-client-adapters.md): how agent skills are shared between clients.
- [ADR-0075](./ADR-0075-run-end-to-end-scenarios-with-playwright-test-on-the-mock-stand-and-the-live-daemon.md): the mock stand the critique runs on.
- Impeccable documentation: <https://impeccable.style/docs/>.
