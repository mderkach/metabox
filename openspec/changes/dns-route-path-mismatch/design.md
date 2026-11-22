# DNS and traffic path mismatch

## Context

Show an actionable DNS notice in Simple Routes and link to the relevant entries in the JSON view. Configuration may contain patterns, rule sets, DNS-specific conditions, and core-specific resolvers that the panel cannot resolve statically.

## Design brief

**User question.** Does this domain use the same path for DNS and traffic, and what will change if I align them?

Show an actionable finding only when both paths can be established for the same domain or pattern. Explain the affected entries and paths in a compact notice. A link in the JSON view takes the user to the matching entries. Before a repair can affect the running configuration, the shared diff presents the actual edit for review.

## Technical design before implementation

- Map supported condition shapes and precedence against the existing route explanation. Keep unknown results distinct from equal paths and from a proven mismatch. The panel does not need to read downloaded rule-set contents.
- Define a safe way to extend a compatible DNS rule while preserving unrelated imported conditions and any earlier matches. If a unique and safe repair cannot be proved, retain the notice and explain why it has no automatic repair.
- Keep the analysis keyed to the same revision as the displayed editor. Revalidate stale findings when the draft changes. Prevent a stale repair from writing to a changed rule.
