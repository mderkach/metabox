## 1. Decisions

- [ ] 1.1 AC-83, AC-84, AC-85: write `design.md` with a `## Design brief` (`/impeccable shape`) for the entry server form, the link block and the toggle, and the decision record for where the toggle is stored and when the firewall rule is written, after the owner answers the open questions. Verified by manual: the owner approves the brief; `make trace-check`.

## 2. Entry server form (AC-83)

- [x] 2.1 AC-83: server inbound types of the fork are grouped and offered as "Inbound proxy server" (`ConfigNodeAdd.model.ts`). Verified by `pnpm --filter web test`: "describes every inbound type of the fork", "groups inbound types into router, proxy server and other, in this order".
- [ ] 2.2 AC-83: generators of users and secrets per type (UUID, shadowsocks key by method, MTProxy secret with the fake-TLS domain). Verified by `pnpm --filter web test`.
- [ ] 2.3 AC-83: the form: port, users or secrets, fake-TLS domain where the type has one, outbound; save writes the inbound and a `route.rules` entry by inbound tag in one draft change, removal deletes both. Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 2.4 AC-83: port check against the dataplane ports, the panel port and other inbounds, reported in the form. Verified by `pnpm --filter web test`.
- [ ] 2.5 AC-83: add the rows of 2.2-2.4 to `docs/Verification.md`. Verified by `make trace-check`.

## 3. Client link and QR code (AC-84)

- [ ] 3.1 AC-84: link builders by type from the inbound and one of its users; round trip against the existing share link parser where the type has one. Verified by `pnpm --filter web test`.
- [ ] 3.2 AC-84: daemon reports the LAN address, the WAN address and whether the WAN link can work; regenerate types with `make schema-daemon`. Verified by `make test`.
- [ ] 3.3 AC-84: link block: LAN link, WAN address or DDNS name entered by the user, QR code, the statement when the WAN link cannot work (CGNAT, toggle off). Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 3.4 AC-84: add the rows of 3.1-3.3 to `docs/Verification.md`. Verified by `make trace-check`.

## 4. WAN port toggle (AC-85)

- [ ] 4.1 AC-85: daemon writes and removes a named `firewall` rule for the server port with snapshot, read-back and restore on a failed write, and reloads fw4. Verified by `make test` with a fake runner.
- [ ] 4.2 AC-85: the rule is removed when the toggle or the server is turned off or the server is deleted; no other code path writes `firewall`. Verified by `make test`.
- [ ] 4.3 AC-85: platform without fw4: the daemon reports it, the toggle states that the port is open by default and offers to bind the server to the LAN address. Verified by `make test` and `pnpm --filter web test`.
- [ ] 4.4 AC-85: panel toggle with its states and failure texts in English and Russian. Verified by `pnpm --filter web test`, `pnpm --filter web check:design` and an independent Impeccable critique.
- [ ] 4.5 AC-85: bench check: the port answers from WAN with the toggle on and does not with it off. Verified by a bench script in `.devcontainer`.
- [ ] 4.6 AC-85: add the rows of 4.1-4.5 to `docs/Verification.md`. Verified by `make trace-check`.

## 5. Documentation

- [ ] 5.1 AC-83, AC-84, AC-85: describe entry servers, the client link and the WAN toggle in the user documentation, English and Russian, and update the derived Russian translation of the spec. Verified by manual: read the pages against the built screens.
