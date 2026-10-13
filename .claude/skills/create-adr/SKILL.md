---
name: create-adr
description: Creates, updates and checks an architecture decision record (ADR) following the metabox repository rules. Use when asked to record, document or revisit an architectural or infrastructure decision, compare technical options, create an ADR after research, or link a new decision to existing ones.
---

# Creating an ADR

Prepare a verifiable architecture decision record based on facts from the repository. Do not substitute research notes, a specification or an implementation plan for an ADR.

## Workflow

1. Read `ADR-reference.md` from this skill's directory in full. It is the source of truth on structure, statuses, template, naming and quality criteria.
2. Study the task context: `docs/PRD.md`, the existing ADRs in `docs/adr/` (PRD appendix A moved there too), the affected code and configs. On a mismatch, the actual state of the code takes priority.
3. Check whether an ADR is needed at all. Do not create one for a local bug fix, formatting, a rename, or a decision already set by the PRD or an existing ADR. If the user insists, do it, but note the weak fit.
4. Collect the decision context: the problem and why it is being solved now; scope and constraints; decision drivers; realistic options; consequences, risks, migration, rollback and ways of validation.
5. Ask clarifying questions only where the answer changes the decision substantially. Otherwise proceed with explicitly named assumptions and open questions.
6. Take the next free number in `docs/adr/`; the name format is `ADR-NNNN-short-decision-title.md`. Do not reuse a number and do not overwrite someone else's ADR.
7. Create the document strictly from the template in `ADR-reference.md`. Do not remove mandatory sections; keep optional ones only when they apply.
8. Check against the quality checklist: the number is unique, all local links exist, the markup has no errors.

## Content rules

- Write in English.
- Phrase the title as a decision, not a topic: "Run procd directly instead of /sbin/init" is good, "devcontainer setup" is bad.
- Separate confirmed facts from conclusions, assumptions and open questions.
- Formulate the decision drivers before comparing options.
- Consider at least two realistic options, including keeping the current approach if possible. Do not add a deliberately weak option to justify a choice made in advance.
- Describe the decision so that compliance can be checked by code, tests or commands.
- Record the negative consequences too.
- Use relative links and only to existing documents. Do not invent missing sources.

## Status

- Create a new ADR with the `Proposed` status.
- Set `Accepted` **only** on explicit confirmation from the repository owner. Your own conclusion does not count as confirmation.
- Do not rewrite the meaning of an accepted ADR after the fact: a new decision is a separate ADR, the old one gets the `Superseded` status, and both get cross-links in the "Supersedes" and "Superseded by" fields. Only editorial changes are allowed in an accepted ADR.

## Result

After writing, report: the file path; the status set; key assumptions and open questions; which checks were run; what the repository owner needs to do to accept the decision.
