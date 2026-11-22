## 1. Cache tag validation

- [x] 1.1 AC-126. Reject shared subscription cache tags during Apply. Verify valid JSONC, positions, valid reuse of URLs, and rejected candidates with daemon tests. Add verification rows and run `make trace-check`.
- [x] 1.2 AC-126. Expose the tag validation in the Config entity for subscription import and wire the existing editor forms. Verify the reused check and form behavior with web tests and a browser scenario. Run `pnpm --filter web check:design` and record an independent review.

Independent Impeccable review checked the conflict state at 1280 and 375 px. The review found that the tag input needed the form controller ref. The Chromium subscription scenario verifies focus on a rejected submission, the retained tag, and the unchanged draft.
