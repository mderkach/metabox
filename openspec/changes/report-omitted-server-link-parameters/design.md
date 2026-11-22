# Design

## Context

The add form validates and parses a link before inserting a server into the draft. The parser builds fields from selected query parameters. Query names disappear when it constructs its result, so the form cannot determine which settings were omitted. Both the form schema and the submit handler use this parser.

The pinned fork exposes `tls.reality.support_x25519mlkem768` in its [outbound REALITY options](https://github.com/shtorm-7/sing-box-extended/blob/d9442d14b19ddd02605bf3ee893a171947038e19/option/tls.go#L252-L257). That structure has no field for `spx`. The [handshake implementation](https://github.com/shtorm-7/sing-box-extended/blob/d9442d14b19ddd02605bf3ee893a171947038e19/common/tls/reality_client.go#L135-L166) uses the boolean to decide whether to retain the hybrid key share.

## Goals / Non-Goals

Make omissions visible at the point of import and keep the draft insertion path shared with the existing form. Connection checks happen outside the import form.

## Decisions

- Derive omitted names from the same parse that builds the node. Count parameters handled by the active transport and security settings and explicitly recognize format syntax with no config equivalent, such as VLESS `encryption=none`. A UI-level allowlist would drift from the actual mapping.
- Attach omission names to the parsed link alongside its fields. Construct the draft from the fields through the existing insertion path. Derive the warning from the current field value so replacements and form resets clear it.
- Keep decoded parameter names in input order and render them as plain text. Deduplicate names without changing the parser's first-value handling of repeated settings.

## Risks / Trade-offs

- A long or unusually formatted parameter name can disrupt a narrow form. Use wrapping text, render names as text, and check the form at 375 px with a long name.
- The warning confirms what the import writes. Connection success depends on the server and settings outside that operation.

## Design brief

- A person pasting a provider link wants to know which settings will be left out and whether they can proceed. Show an inline status beneath the field hint, above the existing Add action, on a valid link with omissions.
- Use the existing form typography and semantic warning treatment. Proposed English copy is “These parameters will be skipped when you add the server” and Russian copy is “Эти параметры не попадут в конфигурацию при добавлении сервера”. Display the names next to the sentence. Keep the action enabled.
- Announce the advisory politely and associate it with the field. Keep focus in the link field and wrap long names within the form. For a valid link with no omissions, show the ordinary hint. For a failed submission, show the current validation or subscription guidance.
- Review the mock-stand flow in both languages at desktop width and 375 px, with keyboard navigation and at least one long parameter name. Use the product and panel design system as the visual references. [Panel design gate](../../../docs/adr/ADR-0078-gate-panel-design-with-the-impeccable-detector-a-brief-and-an-independent-critique.md)
