# ADR-0076. Link requirements to their checks, not code to documents

- Status: Accepted
- Date: 2026-11-13
- Deciders: repository owner

## Summary

A requirement in the PRD (product requirements document) now names the check that confirms it, in the table `docs/Verification.md`; a decision names the code it governs in the "Validation" section of its ADR (architecture decision record). Code no longer names documents: no ADR numbers, no acceptance criterion (AC), non-functional requirement (NFR) or interface principle (UX) IDs, no "PRD" in comments. A script, `make trace-check`, enforces this on pre-push and in CI. Rejected: requirement IDs in code and tests, as some traceability schemes do, and a separate machine-readable feature list next to the PRD. For the owner: a ticked AC needs a row in the table in the same commit; the script reports the criteria without a check but does not fail on them until the table is filled.

## Context and problem statement

An AC checkbox in PRD section 5 is ticked "only when a run confirms it" (`CONTRIBUTING.md`), but which run is recorded nowhere: 72 of 90 criteria are ticked, and none of them points at a test. The link that does exist goes the other way: code comments cite `ADR-NNNN`, `AC-N`, `NFR-N` and "PRD, section N". On 2026-11-13 there were 50 such lines in tracked files outside Markdown. They were removed by hand on 2026-09-27 and came back, because the root `AGENTS.md` allowed "a link to an ADR" in a comment and no check forbade it.

A reference from code says nothing without opening the document, goes stale when a document is renumbered or superseded, and cannot answer the question that matters for a requirement: is it confirmed, and by what. `AC-77` was cited by a screen and two tests while the criterion stayed unticked in the PRD.

The owner decided to move the project to spec-driven development, where the specification points at the code and not the reverse. This ADR covers the requirement-to-check link and the ban on document references in code. How a large feature is specified before code (a temporary specification file, an issue form) is out of scope and gets its own decision.

## Decision drivers

- One fact, one home (root `AGENTS.md`): the requirement text stays in the PRD.
- The link must be checked by a machine; a rule kept only in text came back within weeks.
- Works for every agent client and for people: no dependency on a plugin or a local tool.
- No new dependency; the repository already runs Python 3 and shell scripts from `.github/scripts`.
- Low migration cost: 90 criteria are not rewritten.

## Considered options

1. **A table of checks next to the PRD and a script that checks it and the code.** `docs/Verification.md` maps an ID to a file and a test, job, target or manual scenario; the script resolves every row and fails on a document reference in code. Advantages: the PRD does not grow; the table is plain Markdown that a person reads and a regular expression parses; enforcement is mechanical. Drawbacks: a second file to edit together with the PRD; a row can point at a test that does not really check the criterion, which only review catches. **Chosen.**
2. **A "Verified by" line under each AC in the PRD.** Advantages: one place. Drawbacks: the PRD is already about 155 KB, and every row makes it longer for every reader; the script has to parse prose. **Rejected.**
3. **Requirement IDs in code and tests, checked by a script** (the traceability scheme of regulated industries, also the one the Harness_ru course gives for a certified medical device). Advantages: a test names its requirement where it is defined. Drawbacks: the direction the owner rejected; IDs in code go stale as they already did; it does not show which ticked criteria lack a check. **Rejected.**
4. **A machine-readable feature list (`feature_list.json`) with a verification command and a state set by a script**, as in the Harness_ru course. Advantages: the state is set only by a successful run. Drawbacks: duplicates the PRD criteria in a second format; CI already runs every test, so "the row resolves and CI is green" gives the same guarantee without a state field. **Rejected.**
5. **Keep the current approach.** Ticked criteria stay unproven and document references keep returning. **Rejected.**

## Decision outcome

- `docs/Verification.md` holds rows `| ID | Kind | File | Check |`. Kinds: `go-test`, `bench`, `vitest`, `e2e`, `script`, `ci`, `make`, `manual`; the table in the file says what each Check means and where it runs.
- `.github/scripts/trace-check.py` fails when a row names an ID the PRD does not define, when its file or named check is missing, and when a tracked file outside Markdown contains `ADR-NNNN`, an `AC`/`NFR`/`UX` ID or the word "PRD". The exceptions are listed in the script: the Markdown lint config, the script and its test.
- The script reports the ticked criteria and NFRs without a row and the requirements checked only by hand (`bench`, `manual`). Coverage does not fail the check until the table covers every ticked criterion; then `--strict-coverage` is switched on in `make trace-check`.
- An AC is ticked in the same commit as its row. A benchmark counts as a check by hand: it reports a number and fails no threshold.
- A decision names the code it governs in the "Validation" section of its ADR. A comment in code explains the mechanism itself: what breaks and why.
- `UX-N` principles may have rows but are not required to: they are confirmed through the criteria that apply them.

### Scope and boundaries

All tracked files except Markdown: daemon, panel, schema generator, scripts, workflows, the test bench, `Makefile`, `install.sh`. Markdown documents (PRD, ADRs, guides) keep their cross-references.

## Consequences

### Positive

- For each requirement there is an answer to "what confirms it", and the gaps are listed by the script.
- A document reference in code is caught on pre-push, so it does not come back.
- Comments say what breaks instead of sending the reader to a document.

### Negative

- 72 ticked criteria start without a check in the table; filling it is a separate stream of work, and until it ends the coverage report is only informative.
- A row proves that the test exists, not that it checks the criterion; that stays a review question.
- Editing a test title breaks its row; the script names the row to fix.

### Neutral or deferred

- How a large feature is specified before code, and an issue form for tasks: a separate decision.
- The ADR "Validation" section is not checked by the script yet.

## Risks and mitigations

| Risk                                                                        | Likelihood and impact                     | Mitigation                                                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A row points at a test that does not check the criterion                    | medium; a ticked criterion stays unproven | review the row together with the tick; the share of `manual` and `bench` rows is printed on every run |
| The coverage report is ignored and the table is never filled                | medium; the gap stays as it is now        | fill it by PRD section; switch on `--strict-coverage` when it reaches every ticked criterion          |
| The ban hits a legitimate use of the word "PRD" or an ID in a non-code file | low; a false failure on pre-push          | the exception list in the script, each entry with its reason                                          |

## Compatibility, migration and rollback

The 50 existing references are rewritten in the same change: a comment keeps its reason in words, a requirement it labelled gets a row in the table, a decision it cited names the file in its "Validation" section where that section exists. Rollback: remove `make trace-check` from `lefthook.yml` and the CI workflow; the table and the rewritten comments stay valid.

## Validation

- `make trace-check`: zero errors; the printed coverage line.
- `python3 .github/tests/test_trace_check.py`: the script's behaviour on fixtures, including a failure on a reference in code and the strict coverage mode.
- `git ls-files -z | grep -zv '\.md$' | xargs -0 grep -InE '\b(ADR-[0-9]{4}|(AC|NFR|UX)-[0-9]+|PRD)\b'` prints only the excepted files.

## Links

- [`docs/Verification.md`](../Verification.md), [`docs/PRD.md`](../PRD.md) sections 5–7.
- [`.github/scripts/trace-check.py`](../../.github/scripts/trace-check.py), [`.github/tests/test_trace_check.py`](../../.github/tests/test_trace_check.py).
- Root [`AGENTS.md`](../../AGENTS.md), section "Where technical knowledge lives".
- B. Böckeler, [Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html): spec-first, spec-anchored and spec-as-source.
- [Harness Engineering course](https://github.com/justxor/Harness_ru), modules 8 (feature list) and 10 (rules as executable checks).
