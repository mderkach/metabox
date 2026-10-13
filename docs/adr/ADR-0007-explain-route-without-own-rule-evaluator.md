# ADR-0007. Explain the route with data observed from the core and targeted queries to the binary, without implementing our own rule evaluator

- Status: Accepted
- Date: 2026-09-11
- Deciders: repository owner

## Context and problem statement

US-2 requires showing, for a specific connection, which rule fired and through which proxy chain it went; SM-2 gives two minutes for this without reading the config and logs over SSH. AC-12 requires the same from the Connections screen. Why this is what sets the product apart is stated in the PRD, section 1.3.

The straightforward path to such an explanation is an evaluator of our own: metabox reads `route.rules`, runs the input through them and tells what matched and why. This path has a cost that must be named before choosing. The sing-box rule language covers domains, suffixes, keywords, regex, CIDR, ports and ranges, protocols, processes, neighbours, clash mode, rule sets, logical combinations with `&&`, `||` and inversion, all with their own semantics in a specific fork version. Repeating these semantics in TypeScript or Go violates UX-4 directly: the metabox schema becomes the arbiter instead of the binary, and it creates exactly the drift R-2 guards against.

Checking the fork `v1.14.0-extended-2.7.1` shows how much of what is needed can be obtained by observation.

**The ordered rule list is available.** `GET /rules` (`experimental/clashapi/rules.go`) returns for every rule `type`, `payload` (the result of `rule.String()`) and `proxy` (the result of `rule.Action().String()`). `rule.String()` (`route/rule/rule_abstract.go`) assembles the text of all the rule's conditions, renders logical rules with `&&` and `||`, and inversion as `!(…)`.

**The list order equals the order in the config.** `Router.Initialize` (`route/router.go`) builds `r.rules` with a loop over `option.Route.Rules` one to one, with no insertions or reordering, and `Router.Rules()` returns the same slice. So the `i`-th element of `/rules` corresponds to `route.rules[i]` of the source document.

**The fired rule can be linked to the list, but the formats of the two sources differ.** `experimental/clashapi/connections.go` builds the `rule` field as the conditions, `=>` and the action, with the same rendering as `/rules`. gRPC returns only the conditions: `daemon/started_service.go` puts `metadata.Rule.String()` there without the action, and the neighbouring `outbound` field carries the connection's resolved outbound, not the rule's action. The sources match only in the conditions part.

**Not every rule can end up recorded.** The matching loop in `route/route.go` records the rule and breaks on exactly four actions: `route`, `reject`, `hijack-dns` and `bypass` with a non-empty outbound. `sniff`, `resolve`, `route-options` and `direct` are applied and matching continues; `bypass` without an outbound does not stop it either. The two cases can be told apart by the action string: `RuleActionBypass.String()` renders the empty variant as `bypass()` (`route/rule/rule_action.go`).

**A connection may match no rule.** When `Rule` is empty, the Clash API substitutes the string `final` (`experimental/clashapi/connections.go`), and gRPC leaves the field empty. There is no element with such a name in `/rules`: this is not a matching failure but the action "`route.final` was used".

**A trace is not available.** `adapter/router.go` passes the trackers a single `matchedRule`, and `route/route.go` calls `RoutedFlow` with the same. Neither why the earlier rules did not match nor which conditions were checked is stored anywhere. The same holds for gRPC: in `daemon/started_service.proto` the `Connection` carries only the `rule` string.

**The binary can answer about rule sets.** `cmd/sing-box/cmd_rule_set_match.go` implements `sing-box rule-set match <rule-set path> <IP address/domain>`, a check of whether an address or domain belongs to a set. Next to it live `geosite lookup`, `geosite matcher` and `geoip lookup`.

In scope: what the route explanation is built on and how its reliability is marked. Out of scope: where the data itself comes from, [ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md); the draft diff before Apply (UX-6); estimating the draft's effect on future traffic.

## Decision drivers

1. **UX-4 compliance**: the installed binary stays the arbiter, not the metabox model.
2. **Resilience to fork version bumps** (R-2): a change of rule semantics in the fork must not silently turn the explanation wrong.
3. **Honesty towards the user**: a prediction is not passed off as a fact. This is the most expensive class of errors for a panel whose value is trust in its explanation.
4. **Implementation and maintenance cost** relative to what milestone M1 already requires.
5. **Usefulness of the answer**: the explanation must cover SM-2, not be formally correct and useless.

## Considered options

1. **Our own sing-box rule evaluator.** metabox repeats the matching semantics and explains for each rule why it did not match. Pros: a complete answer that works both for a hypothetical input and for a draft. Cons: a direct violation of UX-4: the metabox code starts deciding route validity (driver 1); every fork release becomes a risk of divergence, which shows up as a wrong explanation, not a build error (driver 2); the volume is comparable to the editor itself and does not fit into M1 (driver 4). **Rejected for v1.**

2. **Observation only, without explaining non-matches.** Show the fired rule, its index and the chain, and nothing more. Pros: zero risk, minimal cost. Cons: it does not cover half of SM-2: "the traffic went the wrong way" more often means "the wrong rule fired", and the user needs to understand which rule caught the request earlier than expected (driver 5). **Rejected as a sufficient solution, chosen as the mandatory core.**

3. **Observation plus targeted retrieval of the reason from the binary and for primitive conditions.** The rule list and the fired rule come from observation. The reason a specific rule did not match is computed on the user's request and only where this can be done without reproducing the whole semantics: rule sets by asking the binary, primitive conditions by direct comparison, everything else is honestly marked as unknown. Pros: the binary stays the arbiter for the most frequent condition (driver 1); nothing can drift, because complex semantics are not reproduced (driver 2); the boundary of knowledge is visible to the user (driver 3); the volume fits into M1 (driver 4); it answers the question "who caught it earlier" (driver 5). Cons: the answer is incomplete: some conditions stay without a reason. **Chosen.**

4. **Pass the rule index through the fork.** `route/route.go` already computes `selectedRuleIndex` next to the selected rule, but `adapter/router.go` passes the trackers only `matchedRule`, and the index never reaches the API. A patch adds the index to the tracker metadata and to both APIs. Pros: the link becomes exact by construction, and the dependency on the `rule.String()` format and the related risk disappear; the project already builds against this fork (ADR-0001), so the path is not exotic. Cons: either waiting for a PR to be accepted, or our own patch that has to be carried over to every fork version; until then the string-based link is still needed as a fallback, so the option does not replace the third one but complements it. **Rejected for v1, kept as a way to close the risk of string comparison after M1.**

## Decision outcome

There is no sing-box rule evaluator of our own in v1.

**The core of the explanation is observation.** The ordered rule list comes from `GET /rules`, and the index of the fired rule is found by comparison with the elements of this list. The index in the list equals the node index in `route.rules` of the applied document, so the transition "connection → rule in the editor" needs no parsing of conditions.

**Matching goes by conditions, not by action.** Both sources render conditions the same way: it is the same `rule.String()` that sits in the `payload` of an `/rules` element. Only the Clash API has the action: it appends it to the string after `=>`; gRPC does not return it at all, and its `outbound` field is the connection's resolved outbound, not the rule's action, and must not be used in place of the action.

The rule is chosen as follows. The daemon takes the candidates with matching conditions and drops those whose action in `/rules` does not stop matching: a recorded fired rule can only be a node with `route`, `reject`, `hijack-dns` or `bypass` with a non-empty outbound. Of the remaining ones the first in order is taken: the router stops at the first match. When the source is the Clash API, its action narrows the choice further. If no suitable candidates remain, `unknown` is returned.

Restoring the action for gRPC from neighbouring fields is not allowed. `common/trafficcontrol/tracker.go` unfolds groups and puts the final node into `outbound`: a rule `route(proxy)` with a `proxy` selector pointing at `hk-01` gives `hk-01`, and the comparison with the action string from `/rules` does not match. The first element of `chainList` keeps the rule's target, but carries neither the route options from `Action().String()` nor the `reject` and `hijack-dns` actions, so it does not become the basis for matching either.

**No match is an observed action, not an unknown.** An empty `rule` field in gRPC and the string `final` in the Clash API mean that no rule matched and `route.final` was used. Such an explanation is marked `observed` and leads to the `route.final` node, not to an element of `route.rules`. The value `unknown` stays only for the case when the conditions are non-empty but were not found in the list.

**The rule list is checked against the applied document on the frontend.** `/rules` is a slice of the running process's rules, not of the file: the process may have loaded a different config. So before leading the user to a node, the panel compares the length of `/rules` with the length of `route.rules` of the applied document and checks that the conditions of the fired rule were found in the list at all. On a mismatch the "connection → node" link is turned off entirely, the explanation is returned with `unknown` and the reason "core runs a different config", and no index into a foreign document is shown.

The check lives on the frontend, not in the daemon, for two reasons. The daemon is forbidden to parse the config contents ([ADR-0002](./ADR-0002-apply-protocol-and-config-ownership.md)), and the document schema and model belong to the panel ([ADR-0001](./ADR-0001-generate-schema-from-fork-registries.md)). An element-by-element check of conditions is done in neither place: it would require reproducing `rule.String()`, exactly the drift this decision avoids. Length and presence are enough to catch the practical case: the process runs a file other than the one open in the editor.

**Rules before the fired one are shown as is.** Each earlier rule is shown with its conditions from `payload` and a mark that it did not match. The reason for each rule is not computed or displayed up front.

**The reason for a non-match is retrieved on request and only in three ways.**

- A `rule_set` condition: a question to the installed binary, `sing-box rule-set match`. The answer is authoritative per UX-4.
- Primitive conditions whose semantics come down to comparison (domain and its suffix, CIDR, port and port range, network, protocol, inbound type and tag) are computed by the daemon directly.
- Everything else (logical combinations, inversion, regex, `process_name`, neighbours, `clash_mode`, conditions that depend on sniffing) is not computed.

**Every statement on the screen carries an origin.** There are exactly three values:

- `observed`: came from the core: the rule list, the fired rule, the chain, connection metadata;
- `computed`: computed by metabox or obtained by asking the binary, with the method stated;
- `unknown`: nothing to compute it with.

Mixing them is forbidden. Statements without an origin do not appear on the screen, and an explanation that has at least one `unknown` is not presented as complete.

**Manual tracing of an arbitrary input is not done in v1.** Without an evaluator, an honest answer to "where will domain X go" is limited to checking set membership and primitive conditions, so it would give `unknown` in the most interesting cases. It makes sense to return to this together with a decision on the evaluator, not earlier.

### Scope and boundaries

The decision covers the daemon as to route explanation, and the Connections and rule editor screens. It does not affect the config schema (ADR-0001) or editing the config as text (ADR-0004).

## Consequences

### Positive

- The product's main function is built on observed data, so it does not diverge from the binary's behaviour when the fork version is bumped.
- The transition "connection → config node" is exact and does not depend on parsing conditions.
- The boundary of knowledge is visible to the user, not hidden: `unknown` stays `unknown`.
- The amount of work fits into M1 and does not require a config corpus to check matching semantics.

### Negative

- The explanation is incomplete: for logical rules, regex and conditions depending on the process or sniffing, the reason for a non-match is not shown.
- Asking the binary about a rule set means launching a process, that is, an operation with latency and a rate limit. It cannot handle bulk use on all rules at once, which is why it is done on request.
- Comparison by the `rule.String()` string is tied to the fork's rendering format. The format is stable and used by the Clash API itself, but it is an implicit dependency.

### Neutral or deferred

- Manual tracing of an arbitrary input and estimating the draft's effect on future traffic are deferred and need a separate decision.
- Explaining the DNS path separately from the route is a separate task; its source (`GET /dns/query`) is recorded in ADR-0006.
- No separate origin value is introduced for a prediction: v1 has no predictions, and when they appear, the input data will distinguish them, not the kind of statement.

## Risks and mitigations

| Risk                                                                                           | Likelihood and impact | Mitigation                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The fork changes the `rule.String()` format, and the link between a rule and the config breaks | Low, high impact      | The mismatch is detectable: the rule is not found in the list, and the daemon returns `unknown`, not a wrong index. Fully closed by option 4, the index from the fork                                                                       |
| The applied config diverges from what sing-box runs                                            | Medium, high impact   | The panel compares the length of `/rules` with `route.rules` of the applied document and the presence of the fired rule's conditions before leading to a node; on a mismatch the link is turned off and `unknown` is returned with a reason |
| `computed` starts being perceived as a fact over time                                          | Medium, medium impact | The origin is part of the data contract, not of the screen design: a statement without it is not returned by the server                                                                                                                     |
| Running `rule-set match` on every click causes noticeable latency                              | Medium, low impact    | The operation is on request, and the result is cached for the lifetime of the applied config and the set                                                                                                                                    |

## Compatibility, migration and rollback

No migration is needed: route explanation is a new function, and existing data and configs are not affected.

Rollback: remove the reason retrieval and keep only the observed core. The origin contract stays: statements simply no longer have the `computed` value.

## Validation

- For a live connection the screen shows the fired rule with its index; the transition opens the same node in the rule editor, and its conditions match the ones shown.
- A config where two rules match in both conditions and action: the explanation points to the first in order.
- A rule with a `rule_set` condition: the reason retrieval returns the binary's answer, and it matches the result of `sing-box rule-set match` run by hand on the same set and domain.
- A rule with a logical condition: the screen shows `unknown`, not a guess.
- A connection that went to `route.final`: the screen shows "no rule matched" as `observed` and opens the `route.final` node instead of returning `unknown`.
- The config is replaced on the device bypassing the daemon and sing-box is restarted: the lengths of `/rules` and `route.rules` differ, the "connection → node" link is turned off, and the explanation comes with `unknown` and a reason.
- The same connection read through the Clash API and through gRPC gives the same rule index.
- A config where a rule with the `sniff` action has the same conditions as the following rule with `route`: the explanation points to the second one, not the first.
- A config with an unfamiliar or unrecognized rule does not break the explanation of the others: the rule is shown with a mark, and the list is not cut off.
- No statement in the API response comes without an origin field.

## Links

- [PRD](../PRD.md): US-2, SM-2, AC-12, UX-4, UX-5, risk R-2;
- [ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md): runtime data sources;
- [ADR-0004](./ADR-0004-edit-config-text-in-place-on-the-client.md): editing the config as text and keeping unrecognized nodes;
- [sing-box-extended](https://github.com/shtorm-7/sing-box-extended): the fork, version `v1.14.0-extended-2.7.1`: `experimental/clashapi/rules.go`, `experimental/clashapi/connections.go`, `route/router.go`, `route/rule/rule_abstract.go`, `route/route.go`, `adapter/router.go`, `cmd/sing-box/cmd_rule_set_match.go`, `daemon/started_service.proto`.
