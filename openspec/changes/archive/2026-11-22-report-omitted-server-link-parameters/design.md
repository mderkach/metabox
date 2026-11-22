# Design

## Context

The add form validates and parses a link before inserting a server into the draft. The parser builds fields from selected query parameters. Query names disappear when it constructs its result, so the form cannot determine which settings were omitted. Both the form schema and the submit handler use this parser.

The pinned fork exposes `tls.reality.support_x25519mlkem768` in its [outbound REALITY options](https://github.com/shtorm-7/sing-box-extended/blob/d9442d14b19ddd02605bf3ee893a171947038e19/option/tls.go#L252-L257). That structure has no field for `spx`. The [handshake implementation](https://github.com/shtorm-7/sing-box-extended/blob/d9442d14b19ddd02605bf3ee893a171947038e19/common/tls/reality_client.go#L135-L166) uses the boolean to decide whether to retain the hybrid key share.

## Goals / Non-Goals

Make omissions visible at the point of import and keep the draft insertion path shared with the existing form. Help operators recover an existing node from the failure shown by its manual latency check.

## Decisions

- Derive omitted names from the same parse that builds the node. Count parameters handled by the active transport and security settings and explicitly recognize format syntax with no config equivalent, such as VLESS `encryption=none`. A UI-level allowlist would drift from the actual mapping.
- Attach omission names to the parsed link alongside its fields. Construct the draft from the fields through the existing insertion path. Derive the warning from the current field value so replacements and form resets clear it.
- Keep decoded parameter names in input order and render them as plain text. Deduplicate names without changing the parser's first-value handling of repeated settings.
- For VLESS with REALITY, map the exact URI boolean values `true` and `false` to `tls.reality.support_x25519mlkem768` when the target schema exposes it. Unrecognized values and use outside that context are omissions. Absence preserves the core default. Keep the fingerprint chosen in the link.
- The raw configuration schema already includes the setting. An unset advanced form field is collapsed by default, and the VLESS primary field list omits this one. Surface it in the existing VLESS REALITY fields, with help that describes the handshake and the dependency on the fingerprint. Use the node editor's normal draft write and Apply flow.
- A probe outcome currently represents success, node failure, or request failure. Reuse it and the applied outbound by tag. A hint is eligible on a failed manual check of a uniquely matched editable VLESS REALITY outbound with the setting absent or false and supported by the core schema. Use the applied config snapshot, including when a draft differs. Scope the message to the check result and clear it on a later success or a change of the applied node.
- Use the existing draft from the checked node’s disclosure. After a confirmed apply, reread the active config and verify the exact change before offering a repeat of the same probe. Separate a fresh no-response outcome from a transport or daemon error. Only a fresh no-response from the same revision can offer an inverse draft. Preserve whether the flag was absent or false and revalidate the target and draft before returning it. The user reviews and applies the inverse through the standard flow.

## Alternatives considered

| Option                                                                                  | Reason for keeping it out of this change                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Warn about the omitted hybrid key share flag on every import                            | The pinned extended core can use the setting. Keeping the omission makes the operator repair a link that already carries an explicit value. The lab reproduced this failure with Xray 26.10.21. |
| Enable the flag automatically for every VLESS REALITY link or update all existing nodes | Missing values keep the core default. Some providers deliberately omit the hint for a host, and existing nodes can need the classical handshake.                                                |
| Attribute any failed probe to the hybrid key share setting                              | A failed probe does not distinguish a rejected REALITY handshake from network, fingerprint, credential, or destination problems. An unchanged node can also succeed on a later retry.           |
| Automatically toggle the flag and retry on the active config                            | A diagnostic should leave the active service alone. An isolated A/B check would need its own lifecycle, timeouts and cleanup and can be designed separately.                                    |

## Adding other diagnostic hints

Keep probe handling, applied node lookup and result presentation reusable. Keep the eligibility check and suggested action for each hint specific to its setting. A later change can add a hint when the applied config and available evidence justify it. For each supported finding document eligibility, evidence, verification, and a safe draft action. Place findings for a node inside the same disclosure. Keep compatibility evidence as data if additional rules require a matrix of versions or settings. Reuse the existing draft and Apply flow for config changes. The first implementation only needs the REALITY hybrid key share hint. A generic rule engine or shared matching framework can wait until a second case demonstrates a need.

## Risks / Trade-offs

- A long or unusually formatted parameter name can disrupt a narrow form. Use wrapping text, render names as text, and check the form at 375 px with a long name.
- A probe failure does not identify the handshake failure layer. The hint is conditional guidance. The lab could distinguish the flag through an A/B change of the same node and the same HTTPS endpoint. On Xray 26.10.21 the pinned extended core with `chrome` needed true. The tested `firefox` failed with true, and Xray 26.7.28 worked in both flag states.
- A globally enabled default would change existing compatibility and remove the operator's ability to preserve the provider's choice. Keep missing values absent.

## Design brief

- A person pasting a provider link wants to know which settings will be left out and whether they can proceed. Show an inline status beneath the field hint, above the existing Add action, on a valid link with omissions.
- Use the existing form typography and semantic warning treatment. Proposed English copy is “These parameters will be skipped when you add the server” and Russian copy is “Эти параметры не попадут в конфигурацию при добавлении сервера”. Display the names next to the sentence. Keep the action enabled.
- Announce the advisory politely and associate it with the field. Keep focus in the link field and wrap long names within the form. For a valid link with no omissions, show the ordinary hint. For a failed submission, show the current validation or subscription guidance.
- Review the mock-stand flow in both languages at desktop width and 375 px, with keyboard navigation and at least one long parameter name. Use the product and panel design system as the visual references. [Panel design gate](../../../../docs/adr/ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md)

### Existing servers

- A failed check shows one question-mark disclosure beside the node's status in the checked group or standalone section. Reserve the status and action area before the control appears and keep them adjacent. Opening expands details below the row. Name the hybrid key share setting before staging, explain that a recent upgrade can require it, and retain uncertainty about the cause. The normal draft and Apply controls complete the change. Distinguish confirmed no-response from an error running the probe, and show a targeted return in the former case only when the original value can be recovered safely. Checking a fresh server link and refreshing an existing subscription are next-step guidance. Updating an existing node from a share link is separate work.
- Place “Hybrid key share (X25519MLKEM768)” and “Гибридный обмен ключами (X25519MLKEM768)” next to the other REALITY settings for supported VLESS nodes. Both editing the setting directly and using inline recovery stage it through the existing confirmation flow.
- Use the ordinary failure or success feedback when eligibility is false. Cover keyboard operation and both languages on the mock stand at desktop width and 375 px. Verify recovery with the same endpoint before and after an explicit draft edit on the isolated OpenWrt and 3x-ui stand.
