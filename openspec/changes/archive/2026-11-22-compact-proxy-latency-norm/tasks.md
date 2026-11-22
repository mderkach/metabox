# Tasks

## 1. Norm interaction on Proxies

- [x] 1.1 AC-113. Implement the fixed-slot InputGroup editor, shared heading, manual indication and Return to auto action for editable servers. Keep the name separate. Save and reset only the selected norm without Apply. Cover maximum input, Escape, focus return and preservation of the name and other records. Run `pnpm --filter web test` and `pnpm --filter web check:design`. Add the scenario checks to `docs/Verification.md`.
- [x] 1.2 AC-113. Refresh the row, chart and comparison from current norm and latency data. Cover resetting with a computed norm, without data, and while latency refetch is pending. Cover preservation of probe failure feedback and add verification rows. Run `pnpm --filter web test`.

## 2. Browser acceptance and documentation

- [x] 2.1 AC-113. Run the Proxies norm scenarios with `pnpm --filter web test:e2e` on the mock stand. Measure the row height, field size and position, action slot and neighboring columns before editing, during editing, after Save and after Return to auto at 320 and 375 px with touch and at 901, 1101, 2213 and 2711 px, all in both themes. Run each reset case with and without a computed norm. Verify access to Return to auto, no overflow, no Apply request and preservation of the server name and other records. Record the independent Impeccable review at 375 px and desktop width, and the matrix in `docs/Verification.md`.
- [x] 2.2 AC-113. Describe the manual and automatic modes in the English and Russian user documentation. Refresh any published derived Russian spec through its normal generation workflow. Run strict OpenSpec validation and `make trace-check`.
