# ADR-0029. Count rule hits in the daemon from connection snapshots since its start

- Status: Accepted
- Date: 2026-09-23
- Deciders: repository owner

## Context and problem statement

AC-46 requires showing, for a rule in the list, how many times it fired. The daemon must count, from the connection stream: neither sing-box nor its Clash API provides such a number. The counter lives as long as the daemon lives, and a restart resets it — the panel says so directly instead of passing off zero as "the rule is dead".

What the code already has:

- Clash API returns only live connections: `GET /connections` is a snapshot, closed connections are not in it. Every connection has a string of the matched rule like `rule_set=apple => route(proxy)`.
- The daemon already knows how to match this string to a `route.rules` node: `matchRule` in `internal/route` compares conditions with the `GET /rules` list of the running process and discards rules whose action does not stop the iteration ([ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md)).
- The runtime stream hub polls `/connections` only while there is a reader, that is, while the panel is open.
- The daemon guide forbids background polling without a consumer. The only exception is traffic accounting `events.Accounting`, with a cost analysis (`apps/metaboxd/docs/guides/DeviceIO.md`, "Resources").

Out of scope: an exact count of every connection and keeping the count across daemon restarts.

## Decision drivers

1. Counting goes on for the whole daemon lifetime, not only while the panel is open.
2. The rule number is not invented: matching only in the way that already exists in ADR-0007.
3. A rule reordered by an apply keeps its count.
4. The idle cost is stated and bounded.
5. No new dependencies.

## Considered options

1. **A separate permanent `/connections` poll in the daemon, the count key is the rule's conditions and action.**
   - A connection is counted when its identifier first appears in a snapshot.
   - The rule list is re-read when a rule appears that is not in the remembered list.
   - The rule number is determined when the count is read, from the current process list.
   - Meets all drivers. Downside: a second exception to the background polling rule.
   - **Chosen.**
2. **Count inside the stream hub while there is a reader.** Cheap, but counting would go on only with the panel open, and "over 3 hours" would mean "over the minutes the panel was open". Contradicts AC-46. **Rejected.**
3. **The count key is the rule number.** Simpler, but after an apply that reordered rules the count would move to another rule. **Rejected.**
4. **Count in the browser from stream frames.** The count would reset with every tab and would differ per viewer. **Rejected.**

## Decision outcome

- `route.Counter` (`apps/metaboxd/internal/route/hits.go`) is started in `main.go` together with traffic accounting and runs until the daemon stops.
- The polling interval is the same as for the connections topic: `connectionsInterval`, one second.
- A connection is counted once — on the first appearance of its identifier. `final` connections are counted separately, connections with a rule that is not in the process list are not counted.
- The count key is the "conditions, action" pair of a process rule. A duplicate rule lower in the list gets zero: the router stops at the first match.
- `GET /api/rules/hits` returns `route.Hits`:
  - `seconds` — how long counting has been going;
  - `rules` — one entry per process rule in its order;
  - `final`.

  A runtime failure is 502 `runtime_unavailable`, as for route explanation.

- The panel checks the length of the process list against `route.rules` of the applied file and does not show the count on a mismatch.
- A draft row gets the count through its rule in the applied file: the node is compared as a whole (`toAppliedIndices`). A rule changed in the draft gets no count.
- The list footer shows the count window "over N s since metaboxd started, a restart resets it".

## Consequences

### Positive

- The count is visible without the panel open and survives an apply that reordered rules.
- Zero reads as "did not fire in this window", not as "the rule is dead".

### Negative

- The count is observed, not exact: a connection that opened and closed between two snapshots does not get into it. Short DNS and QUIC connections are undercounted.
- A permanent idle cost: one `/connections` snapshot per second. With 5000 connections that is parsing a megabyte of JSON per second regardless of whether anyone looks at the panel. There is no measurement on the device.
- With the panel open `/connections` is polled by two — the hub and the counter: requests per second double.
- Rules with identical conditions and action that differ only in fields Clash API does not show merge into one count.

### Neutral or deferred

- The count is not stored on disk: AC-46 directly requires a reset on restart.
- Merging the hub poll and the counter poll into one — after measuring the cost on the device.

## Compatibility, migration and rollback

A new endpoint, the contract of existing ones does not change. Rollback: remove `route.NewCounter` from `main.go`: the endpoint disappears, and the panel shows the list without the column and with the caption "count not received".

## Validation

- `go test -race ./internal/route ./internal/httpapi`:
  - a connection is counted once;
  - the count follows a reordered rule;
  - the list is re-read on an unknown rule;
  - a duplicate gets zero;
  - the count window is computed on the `synctest` fake clock;
  - the endpoint returns 502 with the runtime down.
- `pnpm --filter web exec vitest run EditorPage Rule.applied`:
  - the column and the count window are visible;
  - a process on another config does not hand out the count;
  - a changed rule is marked and gets no count.
- On the device — measure the daemon RSS and CPU at idle with 5000 connections.

## Links

- `docs/PRD.md`, AC-46;
- [ADR-0007](./ADR-0007-explain-route-without-own-rule-evaluator.md) — matching a rule without an own evaluator;
- `apps/metaboxd/internal/route/hits.go`, `apps/metaboxd/internal/httpapi/httpapi.go`;
- `apps/web/src/pages/Editor/lib/Editor.lib.ts`, `apps/web/src/entities/Rule/model/Rule.applied.ts`.
