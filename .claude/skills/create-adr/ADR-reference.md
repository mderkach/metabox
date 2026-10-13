# ADR: canonical reference

The normative source on ADR structure, statuses, template, naming and quality for the `create-adr` skill. The template and the checklist are edited only here.

## Essence

An ADR records a significant technical or infrastructure decision: the context in which it was made, the options considered, the consequences. It answers "why is the system built this way and which trade-offs were accepted", not "how is the code organised".

An ADR is not: a transcript of research; a product specification; an implementation plan; a replacement for contracts, tests and public API documentation; a way to document every local change.

## Relation to the PRD

`docs/PRD.md` is the source of **requirements**. Appendix A held the decisions made before ADRs were introduced; its sections moved to `docs/adr/`, and the PRD keeps headings with links. A decision already recorded in an ADR is not recorded again: a new ADR links to it.

An ADR is created for decisions that are not requirements: test bench setup, a workaround for a platform limitation, a tool choice, an implementation convention. If a decision changes a requirement, the PRD is edited instead of writing an ADR.

## When it is needed

Create or propose an ADR if the decision: changes module or layer boundaries or the direction of dependencies; introduces a new architectural or infrastructure pattern; adds a significant dependency or external integration; changes a public contract, data model or storage format; requires a migration, a transition period or supporting several approaches; has several realistic options with long-term trade-offs; answers a question whose reason cannot be reliably recovered from the code.

Not needed: a local bug fix, an obvious refactoring without contract changes, formatting, a rename, a decision already set by the PRD or an existing ADR.

## Lifecycle

- `Proposed`: a draft is prepared, the decision is not made;
- `Accepted`: accepted by the repository owner;
- `Rejected`: the option was considered but not accepted;
- `Superseded`: replaced by a new ADR; add a link to the replacing one;
- `Deprecated`: no longer recommended; there may be no direct replacement.

An accepted ADR is not rewritten after the fact: a new decision is recorded in a separate ADR, the old one gets `Superseded`, and they are linked to each other. Only editorial changes that keep the meaning are allowed in an accepted ADR.

## Who makes the decision

The agent studies the code and documentation, identifies constraints, prepares and compares options, writes a `Proposed` draft, checks links and template compliance. The agent does **not** set `Accepted`; the repository owner does.

## Location and naming

Path: `docs/adr/ADR-NNNN-short-decision-title.md`. The number is sequential and immutable, starting from `0001`. Before creating, look at the numbers taken in the directory and take the next free one.

The title is the accepted or proposed decision, not a topic:

- good: `Run procd directly instead of /sbin/init in the target container`;
- bad: `devcontainer setup`.

## Template

Remove optional sections when they objectively do not apply. Do not remove: "Context and problem statement", "Decision drivers", "Considered options", "Decision outcome", "Consequences".

```md
# ADR-<NNNN>. <Short decision title>

- Status: Proposed | Accepted | Rejected | Superseded | Deprecated
- Date: YYYY-MM-DD
- Deciders: <repository owner or team>
- Supersedes: <link to the previous ADR, if applicable>
- Superseded by: <link to the new ADR, if applicable>

## Context and problem statement

Current state, the problem and the boundaries of the decision: why the decision is needed now; which requirements affect it; what is in and explicitly out of scope; which constraints are already set by code, infrastructure or other decisions. Do not describe the chosen decision in the context.

## Decision drivers

Criteria that matter for the decision: compliance with PRD requirements; fit with the architecture; complexity of implementation and maintenance; reproducibility; reliability and observability; testability; backward compatibility; migration cost and the possibility of rollback. Keep only the applicable ones.

## Considered options

1. **<Option A>**: description, advantages, drawbacks, risks. **Chosen / Rejected** and why.
2. **<Option B>**: the same.
3. **Keep the current approach**: consequences of not changing anything, if applicable.

The options are realistic and compared by the same criteria. Do not add a deliberately weak option to justify a choice made in advance.

## Decision outcome

The chosen option in a verifiable form: what exactly is done; which implementation rules are mandatory; which dependencies are allowed and forbidden; what is deliberately deferred and what is a non-goal.

### Scope and boundaries

Optional: the specific directories, layers, images or contracts the decision applies to.

## Consequences

### Positive

- <consequence>.

### Negative

- <accepted drawback, tech debt, operational complexity>.

### Neutral or deferred

- <non-goal or decision deferred to another ADR>.

Consequences describe the result of the decision; they do not repeat its wording.

## Risks and mitigations

Optional, for significant risks:

| Risk   | Likelihood and impact | Mitigation                           |
| ------ | --------------------- | ------------------------------------ |
| <risk> | <estimate>            | <how we prevent or detect it>        |

## Compatibility, migration and rollback

Impact on existing data, configs and clients; migration stages; support for the old behaviour; conditions and method of rollback. If not required, state `Not applicable` explicitly and why.

## Validation

How to check compliance and the result: commands (`make test`, `make apply-check`, `pnpm -C web lint`), tests, linter constraints, observable signs at runtime, manual acceptance scenarios.

## Links

- <PRD and relevant ACs>;
- <related ADRs>;
- <key implementation files>;
- <external sources: documentation, issue, release>.
```

## Quality checklist

Before review, make sure that:

- the title reflects the decision, not the area of discussion;
- the context explains the problem and does not substitute the decision for it;
- the decision drivers are formulated before comparing options;
- at least two realistic options are considered, or it is explained why there are no alternatives;
- the decision is unambiguous and verifiable;
- negative consequences are listed too;
- migration, compatibility and rollback are described or explicitly not applicable;
- the validation contains observable methods, not intentions;
- all external claims have links; missing sources are not invented;
- the status and "Deciders" match the actual state of approval;
- the ADR does not duplicate the PRD, an implementation plan, code or another ADR.
