# ADR-0087. Keep deliberate hand checks apart from hand checks still owed

- Status: Accepted
- Date: 2026-11-19
- Deciders: repository owner

## Summary

`docs/Verification.md` gets a section "Checked by hand on purpose": a requirement part listed there is checked by hand by decision, because only the router, its hardware or an event the bench cannot produce shows it, and the row says why. Every `manual` row outside that section is a check still owed. `make trace-check` reads the section, fails on a row there without a scenario or a reason, and lists both groups on every run. It also fails on a relative link in `openspec/specs/` or `openspec/changes/` that points at nothing, which an archive of an OpenSpec change used to leave behind. Rejected: a reason column for every `manual` row, and a list of the deliberate checks kept in the script. For the owner: a new `manual` row is debt unless it goes into the section with a reason.

## Context and problem statement

[ADR-0076](./ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md) made every requirement name its checks in `docs/Verification.md`, with a `manual` kind for a scenario a person runs. On 2026-11-19 the table had twelve `manual` rows. Some of them can never run in CI: cutting the power during a flash write, memory and CPU of the daemon on the router, the time of an Apply on the router's hardware. Others are plain gaps that a test on the bench or in the panel would close (issue #332). The table did not tell the two apart, and the script reported only the requirements that had no automated row at all, so a manual part next to a test was invisible.

A second gap came from OpenSpec ([ADR-0081](./ADR-0081-keep-behaviour-specs-and-changes-in-openspec.md)): `openspec archive` copies a delta's relative links to ADRs as they are. Written for the depth of `openspec/changes/<name>/specs/<domain>/`, they point at nothing in `openspec/specs/<domain>/`. Two such links were fixed by hand in `openspec/specs/access/spec.md` (issue #370); nothing stopped the next one.

## Decision drivers

- The debt of hand checks is visible on every run and does not depend on someone remembering which rows are deliberate.
- A deliberate hand check carries its reason next to it, readable without the task context.
- The table stays plain Markdown that a person reads and a regular expression parses; no new dependency.
- A broken link after an archive is caught before the merge, not by a reader.

## Considered options

1. **A section of its own with `| ID | Scenario | Why by hand |` rows, read by the script.** The heading marks the rows; the script counts them as covered, refuses a row without a reason, and lists the `manual` rows elsewhere as owed. Advantages: the reason sits next to the scenario; moving a row is a decision visible in a diff. Drawbacks: the script depends on the heading text. **Chosen.**
2. **A reason column on every row of the main table.** Advantages: one table. Drawbacks: four hundred rows get an empty cell, and the reason says nothing for an automated row. **Rejected.**
3. **A list of deliberate IDs in the script.** Advantages: no format change. Drawbacks: the reason lives in code or nowhere, and the list is per requirement while a requirement mixes deliberate and owed parts. **Rejected.**
4. **Keep the current table.** The debt stays mixed with the deliberate checks. **Rejected.**

For the links: a check in the same script over `openspec/specs/` and `openspec/changes/` (archived changes excluded: they sit one level deeper than the delta they came from) was chosen over a post-archive fix step, which a person can skip, and over a Markdown link checker, which is a new dependency for one rule.

## Decision outcome

- `docs/Verification.md` ends with the section `## Checked by hand on purpose`. A row there is `| ID | Scenario | Why by hand |`; both texts are filled in. The reason names what the bench or CI cannot reproduce.
- A part goes into the section only when it needs the router, its hardware or an event the bench cannot produce. A part that the bench, a unit test or an end-to-end scenario could cover stays a `manual` row in the main table: debt.
- `.github/scripts/trace-check.py` counts a row of the section as a check of its requirement, fails on a row with a missing cell, and prints "checked by hand on purpose" and "manual checks owed" with their IDs.
- The same script fails on a relative link in `openspec/specs/` or `openspec/changes/`, outside `archive/`, whose target does not exist.

## Consequences

### Positive

- The owed hand checks are one line of the script output, on pre-push and in CI.
- A deliberate hand check states why it cannot be automated, so it is not reopened by every review.
- An archive that breaks a link fails the pull request that archives it.

### Negative

- Renaming the heading silently turns every deliberate row into a row the script refuses: the cell count no longer matches the main table. The failure is loud, but the heading text is part of the format.
- The script does not judge a reason: a weak one passes, as a weak test name does.

### Neutral or deferred

- Links in other documents (`docs/`, guides) are not checked; only the OpenSpec archive moves files automatically.

## Compatibility, migration and rollback

The rows of AC-63, NFR-3, NFR-4 and NFR-5 moved into the section in the same change; the other `manual` rows stay in the main table as debt (issue #332). Rollback: move the rows back as `| ID | manual | | scenario |` and revert the script; the IDs and the coverage do not change.

## Validation

- `make trace-check`: zero errors; the output names the requirements checked by hand on purpose and the owed `manual` rows.
- `python3 .github/tests/test_trace_check.py`: a row of the section covers its requirement under `--strict-coverage`, a row without a reason fails, a `manual` row in the main table is reported as owed, a link written for the depth of a change folder fails in `openspec/specs/`.
- Governed files: `docs/Verification.md`, `.github/scripts/trace-check.py`, `.github/tests/test_trace_check.py`.

## Links

- [`docs/Verification.md`](../Verification.md), section "Checked by hand on purpose".
- [ADR-0076](./ADR-0076-link-requirements-to-their-checks-not-code-to-documents.md): the table and the script this decision extends.
- [ADR-0081](./ADR-0081-keep-behaviour-specs-and-changes-in-openspec.md): OpenSpec and its archive.
- Issues #332 (requirement parts confirmed only by hand) and #370 (links broken by an archive).
