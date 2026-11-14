# ADR-0081. Keep behaviour specs and changes in OpenSpec

- Status: Accepted
- Date: 2026-11-14
- Deciders: repository owner
- Supersedes (as to where requirements are defined and what counts as built): [ADR-0076](./ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md)
- Supersedes (as to where the design brief is posted and approved): [ADR-0078](./ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md)

## Summary

The acceptance criteria (AC) and non-functional requirements (NFR) move from the PRD (product requirements document) to OpenSpec, an open-source spec-driven development (SDD) tool. Built criteria live in `openspec/specs/<domain>/spec.md`, one file per domain, and each requirement keeps its ID and its text word for word. Criteria not built yet are proposals in `openspec/changes/`. Work that changes behaviour is a change folder, `openspec/changes/<name>/`, with a proposal, delta specs, a design and a task list. When the work ships, the change is archived and its delta merges into the main specs. The link to checks from [ADR-0076](./ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md) stays: `docs/Verification.md` and `make trace-check` now read the specs too. Specs are written in English only. The documentation site will publish a Russian translation as a derived file, with a freshness check. Rejected: a home-made spec file per large feature, GitHub Spec Kit, the oh-my-claudecode (OMC) plugin's own SDD process, and keeping the PRD as the only spec. For the owner: one more dev dependency and pre-push step; a feature is approved by merging its change proposal; the PRD keeps the product sections, and its section 5 only points to the specs and the changes.

## Context and problem statement

ADR-0076 linked requirements to checks and left open how work is specified before code. On 2026-11-14 three ways coexisted:

- issues with "Wanted" and "Done" paragraphs;
- plans of the OMC plugin in a folder outside git, invisible to Codex and to the owner;
- a draft home-made scheme with a temporary file per large feature.

The PRD holds 90 criteria in one file of about 155 KB. A criterion is "done" when its checkbox is ticked, and 70 of the 78 ticked ones had no check on record.

The owner asked for a full SDD tool rather than a home-made one, compatible with the Harness_ru course and able to feed a documentation site in English and Russian.

The scope of this ADR is the place and format of behaviour requirements and of work in progress. Product sections of the PRD (problem, personas, goals, scope, non-goals, constraints, risks, milestones) and decision records stay where they are.

## Decision drivers

- One fact, one home: a requirement exists once; its check is linked, not copied.
- Works for Claude Code, Codex and people alike, from files in git.
- Fits the Harness_ru course: behaviour with a verification command, state set by a script, a contract before code, a separate evaluator, rules as executable checks.
- Brownfield: about 90 criteria already exist and are linked to checks by ID.
- Can feed a documentation site, and the interface is bilingual.
- Low lock-in: plain Markdown that stays readable without the tool.

## Considered options

1. **OpenSpec 2.0 with the built-in `spec-driven` schema and project rules in `openspec/config.yaml`.**
   - Advantages: specs by domain instead of one large file; a change folder holds the contract of work in progress and its tasks; archive merges deltas, so "built" means "in the main specs"; skills for Claude Code and Codex; `openspec validate` checks the structure; plain Markdown.
   - Drawbacks: a new dev dependency; version 2.0.0 was released on 2026-11-11; the old criteria are descriptive ("sing-box is started by…"), so the tool's style warnings stay on them; usage telemetry is on by default.
   - **Chosen.**
2. **The same with a forked schema** (`openspec/schemas/metabox/`). Advantages: full control of templates. Drawbacks: the fork has to follow every upstream template change by hand; everything the project needs fits into `config.yaml` rules. **Rejected.**
3. **A home-made temporary spec file per large feature and an issue form**, the draft of 2026-11-14. Advantages: no dependency. Drawbacks: the PRD stays one large file; a home-made tool repeats what OpenSpec already does, with no validator and no archive. **Rejected.**
4. **GitHub Spec Kit**: `specs/NNN-feature/` per feature, kept forever. Advantages: known layout. Drawbacks: no living spec of current behaviour; the folders duplicate each other and drift from the code. **Rejected.**
5. **OMC's own SDD process.** Advantages: already installed for Claude Code. Drawbacks: plans outside git, only Claude Code runs it. **Rejected.**
6. **Keep the PRD as the only spec.** Advantages: no change. Drawbacks: one large file; no place for work in progress; the site would have to parse the PRD. **Rejected.**

## Decision outcome

- **Tool.** `@fission-ai/openspec` is a root dev dependency with the exact version. The CLI runs as `pnpm --silent openspec`; the script sets `OPENSPEC_TELEMETRY=0`. The skills are generated for Codex into `.agents/skills/openspec-*`, and `.claude/skills/openspec-*` link to them, as for the other shared skills. They are generated files: `openspec update` rewrites them.
- **Specs.** `openspec/specs/<domain>/spec.md`. A domain is a capability of the product (`apply`, `dataplane`, `access`, `devices`, …), not a subsection of PRD section 5: the subsections grew by date, and unrelated criteria sat together. `non-functional` holds the NFRs. PRD section 5 keeps one table: the domain, its built criteria and the proposals.
  - A requirement header starts with its ID: `### Requirement: AC-48 <name>`.
  - A criterion moved from the PRD keeps its text word for word, except that the main verb of its first sentence takes `SHALL` ("is started" becomes "SHALL be started"). Without the keyword, a change that modifies the criterion fails strict validation. Scenarios are added, named after the cases its checks confirm.
  - Every built criterion of section 5 and every NFR moved in one pull request, and the checks got their rows in `docs/Verification.md`.
- **State.** A requirement in `openspec/specs/` is built; one in `openspec/changes/` is not built or not confirmed. Of the 18 criteria that were unticked at the move, four turned out built and covered by tests (AC-7, AC-69, AC-74, AC-75) and went into the specs with their rows. The other 14 are ten proposals in `openspec/changes/<name>/`: the requirement as an ADDED delta, what the code already does, the tasks left, and open questions; each says that the owner has not approved it.
- **Checks.** `make trace-check` reads requirement IDs from the PRD, the main specs and the open changes. It fails on an ID defined twice and treats a requirement of the main specs as ticked. Coverage is strict: every built requirement has a row, and `make trace-check` fails on one without it.
- **Validation.** `pnpm spec:check` runs on pre-push and in CI. The main specs are validated in normal mode: a number of moved criteria are longer than the tool's 500-character style limit, and they are not split to fit it. Changes are validated in normal mode too: some of the criteria that moved into changes are longer than the limit, and strict mode would fail on them. The style of a new requirement is a rule of `openspec/config.yaml`, printed as a warning, not a gate.
- **Work.**
  - A change is the contract of a task that alters behaviour. Its proposal names the issue, the out-of-scope list and open questions; merging the proposal is the approval.
  - Tasks name requirement IDs and the command that verifies them.
  - A bug fix that restores specified behaviour needs no change folder: the issue is the contract.
- **Panel design.** A new screen, block or redesign carries its Impeccable design brief in the change's `design.md`, approved with the proposal. This replaces the separate approval in the issue from [ADR-0078](./ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md); the detector and the critique stay as they are.
- **Languages.**
  - Specs and every OpenSpec artifact are English.
  - The documentation site publishes a Russian translation of the specs as a derived page. The page stores a hash of its English source, and a check fails when the source changes and the translation does not. A note on the page says the English text prevails.
  - User guides on the site exist in English and Russian.
- **Product sections.** PRD sections 1–4 and 8–11 stay. Section 7, interface principles UX-1…UX-8, stays in the PRD: principles are not observable behaviour.
- **Decisions.** Records stay in `docs/adr/`. A change's `design.md` links to them and holds only decisions local to the change.

### Scope and boundaries

`openspec/`, `docs/PRD.md` section 5 and the NFR table of section 6, `docs/Verification.md`, `.github/scripts/trace-check.py`, the root `package.json`, `lefthook.yml` and the `web` job of CI.

## Consequences

### Positive

- Each domain is a file of a few kilobytes that an agent can load whole.
- Work in progress has one visible place in git, shared by every client.
- "Built" is a fact that a script reads, not a checkbox a person sets, which is the Harness_ru rule of a state set only by verification.
- The specs are a ready source for the documentation site.

### Negative

- Ten proposals are open at once though nobody works on most of them; `openspec list` does not tell a proposal from work in progress, the open questions of the proposal do.
- A missing `SHALL` or an over-long requirement in a change is a warning, not a failure.
- Moved criteria longer than 500 characters or without a finite verb keep a style warning until a change made for that purpose rewrites one; the warnings print on every pre-push.
- Version 2.0.0 is days old; an upgrade is a separate, reviewed change.
- Skills that the tool generates call `openspec` directly and allow only that command; an agent has to use `pnpm --silent openspec`, which `config.yaml` tells it, and Claude Code asks for permission on it.
- Archive deletes nothing, so `openspec/changes/archive/` grows with every change.

### Neutral or deferred

- The documentation site, the derived Russian pages and their freshness check are a separate change.
- The expanded OpenSpec workflows (`verify`, `onboard`) need a change of the user's global OpenSpec profile and are not required.

## Risks and mitigations

| Risk                                                      | Likelihood and impact                        | Mitigation                                                                                           |
| --------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A scenario added to a moved criterion changes its meaning | medium; a wrong behaviour reads as specified | the criterion text stays word for word; scenarios follow the existing checks; review per domain      |
| Two changes take the same requirement ID                  | medium; a broken link to checks              | `make trace-check` fails on a duplicate ID                                                           |
| A breaking release of OpenSpec changes the format         | medium; validation or skills stop working    | exact version pin; the format is Markdown that stays readable; upgrades are separate changes         |
| Agents keep planning in plugin folders out of habit       | medium; plans invisible again                | `config.yaml` context and the rule in `AGENTS.md`                                                    |
| Telemetry runs where the script is bypassed               | low; command names reach the vendor          | the script sets the variable; CI disables it by itself; a global opt-out is described in Development |

## Compatibility, migration and rollback

The pilot moved Dataplane (AC-48…AC-57) to try the format; the other domains and the NFRs moved after it in the same pull request, with rows for every built requirement. Rollback: copy the specs' requirement texts back into PRD section 5, remove `openspec/`, the dependency, the scripts and the hook step; `docs/Verification.md` stays valid because the IDs do not change.

## Validation

- `pnpm spec:check`: zero failures.
- `python3 .github/tests/test_trace_check.py`: the IDs of `openspec/specs/` count as built, a duplicate ID fails.
- `make trace-check` with strict coverage: every requirement of `openspec/specs/` has a row in `docs/Verification.md`.
- `openspec/config.yaml`: the project rules for proposals, specs, designs and tasks.
- `lefthook.yml` (pre-push step `specs`) and `.github/workflows/ci.yml` (job `web`).

## Links

- [ADR-0076](./ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md): requirements link to checks.
- [ADR-0078](./ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md): the design brief, the detector and the critique.
- [ADR-0073](./ADR-0073-share-agent-skills-and-keep-native-client-adapters.md): shared skills and client links.
- [OpenSpec](https://github.com/Fission-AI/OpenSpec): concepts, delta specs, customization.
- [Harness Engineering course](https://github.com/justxor/Harness_ru): the feature list, the sprint contract, the evaluator.
- B. Böckeler, [Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html).
