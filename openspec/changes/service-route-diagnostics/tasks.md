# Tasks

## 1. Context and observations

- [ ] 1.1 AC-127. Resolve the selected service rule against the applied revision and return its configured outbound and provable live observations. Cover missing, stale, ambiguous and draft-only targets, as well as the absence of a live match. Run `make test` and add the corresponding rows to `docs/Verification.md`.
- [ ] 1.2 AC-127. Add the approved desktop column and phone action in both Simple rule views. Open Diagnostics with the relevant applied rule selected. Cover destination, draft state, keyboard focus and responsive layouts on the mock stand. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` and `pnpm --filter web check:design`, get an independent Impeccable critique, and add the verification rows.

## 2. Active probes

- [ ] 2.1 AC-128. Implement scoped, user-initiated TCP/HTTPS, UDP/STUN and DNS checks where the path can be established. Cover different or unknown paths, timeouts, unavailable methods, and no direct fallback for a routed probe to a controlled target. Run `make test` and add the verification rows.
- [ ] 2.2 AC-128. Show the scope, protocol, method, observed result and unknown reason in Diagnostics. Verify that opening the contextual view does not initiate probes and that a direct comparison is explicit. Run `pnpm --filter web test`, `pnpm --filter web test:e2e` and `pnpm --filter web check:design`, get an independent Impeccable critique, and add the verification rows.

## 3. Documentation

- [ ] 3.1 AC-127, AC-128. Update the user documentation in English and Russian and the derived Russian spec translation. Explain the actions, the scope of each probe and how to interpret unknown results. Verify that both languages cover the same workflow and run `make trace-check`.

## Workflow follow-up

- **Independent bench task: verify a LAN client's behavior when its selected proxy goes down.** Run this separately from the panel implementation and the routed diagnostic probe in task 2.1. In the isolated OpenWrt bench, use a policy that blocks direct fallback and a controlled destination. Establish the baseline through the proxy, make just the proxy unavailable, and keep sing-box and WAN alive. Verify a fresh routed LAN connection cannot reach the destination directly by observing WAN traffic. Confirm that a separate direct control still works and that the original path recovers when the proxy returns. Run `make dataplane-check` in the configured bench. Link the scenario to an applicable existing requirement if one covers it. If a new fallback guarantee is needed, open a separate dataplane delta first. AC-52 covers core crash and restart. This follow-up can be pulled into a later dataplane task independently of this change's archive.
