# ADR-0065. Keep the draft text in `localStorage`, store only a fingerprint of its base and clear it on logout

- Status: Proposed
- Date: 2026-10-25
- Deciders: repository owner

## Context and problem statement

[ADR-0043](./ADR-0043-treat-manual-json-as-a-feature-and-split-save-from-apply.md) and AC-70 of [`../PRD.md`](../PRD.md) require the config draft to survive a page reload. The panel keeps it in `localStorage` under `metabox.config.draft`. Until this decision the record held `{ base, draft, lists }`, where `base` was the full config text the draft was made from and `draft` the full edited text: two copies of a config with node UUIDs, passwords and Reality private keys, in clear text, surviving logout and the browser being closed.

[ADR-0052](./ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md) refused to keep the session token in `localStorage` because any script on the page can read it. The config is worth more than the token. At the same time logout (`features/Auth/AuthLogout`) only dropped the Query cache: the document store and the stored record stayed behind the login screen.

Facts the decision depends on:

- The panel is served over plain `http://` in the LAN, so `crypto.subtle` is unavailable: no SHA-256 and no AES without a JavaScript implementation.
- The panel loads no third-party script; the API and the SPA share one origin. A script that can read `localStorage` of the panel origin can also read `sessionStorage` and the page memory.
- The session cookie has no `Max-Age`: it ends with the browser session unless the browser restores it.
- Several panel tabs share one `localStorage` record; the in-memory document of each tab is its own ([PR #107](https://github.com/mderkach/metabox/pull/107)).

In scope: what the stored draft record contains, where it lives, and what logout does with it. Out of scope: HTTPS, the apply `If-Match` base (the daemon `ETag`), what other stores keep after logout.

## Decision drivers

- A draft is not lost on a page reload (AC-70, UX-2); losing it on reload is not acceptable.
- The storage holds as little of the config as the feature needs.
- Nothing of the config stays in the browser after an explicit logout.
- No new dependency and no hand-written cryptography in the panel.
- The stale check ("the config on the device moved since the draft") keeps working after a reload.

## Considered options

### What the record holds as the base

1. **The full base text.** Exact comparison, but a second copy of the config in the storage. **Rejected.**
2. **A non-cryptographic fingerprint (FNV-1a, 32 bits) computed in JavaScript.** Enough to notice that the base moved. A collision hides the stale warning for that one draft; the apply `If-Match` does not cover this case, since it carries the `ETag` of the text read last, not of the text the draft was started from. The chance is about one in four billion per draft and is accepted. **Chosen.**
3. **SHA-256 through `crypto.subtle`.** Unavailable over `http://`. **Rejected.**

### Where the draft text lives

1. **`localStorage`, cleared on logout.** Survives reload, tab close and browser close; shared by the tabs of one browser profile; readable by any script on the page, as any browser storage is. After logout nothing is left. Without logout the draft stays on the disk of the browser profile until the user applies or discards it. **Chosen.**
2. **`sessionStorage`.** Survives a reload, dies with the tab and is not shared with a new tab: a draft left overnight in a closed tab is gone, and a user who opens the panel in a second tab starts without it. Against the same script on the page it protects nothing: the origin is the same. It only shortens how long the text lies on disk, at the price of AC-70 read as "restored on the next opening". **Rejected.**
3. **Ciphertext in `localStorage`, the key in memory.** The key is lost on reload, and the draft with it. **Rejected**: it breaks the one requirement that cannot be traded.
4. **Ciphertext in `localStorage`, the key in `sessionStorage`.** Survives reload, dies with the tab like option 2, needs a cipher without `crypto.subtle`: a dependency or hand-written AES, both forbidden by the repository rules, and the key sits next to the ciphertext for the same script that would read the text. **Rejected.**
5. **Keep the current approach.** Two copies of the config outlive logout. **Rejected.**

## Decision outcome

- The stored record is `{ version: 2, base, draft, lists }`, where `base` is the FNV-1a fingerprint of the applied text the draft was made from (`fingerprint` in `shared/lib`), or `null`. A record without `version` was written before this decision: its `base` text is replaced by its fingerprint and the record is rewritten on the first read, so the text leaves the storage on the first open of the new panel and the draft is kept. A record of any other version is read as no draft.
- `ConfigDocumentState.draftBase` holds the same fingerprint; `isStale` compares it with the fingerprint of the applied text; `rebase` takes the text and stores its fingerprint.
- Logout resets `ConfigDocumentState`; the store subscription removes the stored record on an empty draft, so nothing of the config stays in the browser after logout. The Query cache is dropped as before.
- The draft text stays in `localStorage` in clear text. Encryption in the panel is a non-goal until the panel is served over HTTPS.

### Scope and boundaries

`apps/web/src/entities/Config/model/Config.storage.ts`, `Config.store.ts`, `apps/web/src/features/Auth/AuthLogout`, `apps/web/src/shared/lib/fingerprint.ts`.

## Consequences

### Positive

- One copy of the config in the storage instead of two, and none after logout.
- An upgrade keeps the user's draft.

### Negative

- The draft text is still readable by a script on the page and by whoever opens the browser profile while the user did not log out. Logging out is the user's only protection on a shared computer.
- A 32-bit fingerprint can collide: then the stale warning is missing for that draft, and the `ETag` check on apply does not catch it.
- Logout in one tab does not reach the document of another open tab: the panel does not listen to the `storage` event, and the next edit in that tab writes the draft text back. Closing the other tabs before logout is the user's job until that is addressed.
- Session loss by a 401 (expiry, a password change in another browser) does not clear the draft: only an explicit logout does. A draft left for a day still opens after the next login, which is the point of keeping it.

### Neutral or deferred

- Clearing the draft on session loss and on closing the browser is left open: both lose drafts the user may want back.
- What the other stores (runtime stream, logs) keep behind the login screen is not part of this decision.

## Compatibility, migration and rollback

A record of the old shape is migrated on read, see "Decision outcome". A panel of the previous version reading a `version: 2` record parses `base` as text that matches nothing and shows the draft as stale until it is discarded; the two do not run side by side, the panel ships with the daemon. Rollback: revert the change; the old panel reads the new record as above.

## Validation

- `pnpm --filter web test`: `shared/lib/__tests__/fingerprint.test.ts` pins the FNV-1a reference values; `entities/Config/__tests__/Config.store.test.ts` checks that the stored record holds no applied text, that an old record is kept as a draft and rewritten without the text, and that the stale warning survives a reload; `features/Auth/AuthLogout/__tests__/AuthLogout.api.test.tsx` checks that logout empties the document store and removes the record.
- Manual: edit the config, log out, inspect `localStorage` of the panel origin in the browser devtools: no `metabox.config.draft` key.

## Links

- [`../PRD.md`](../PRD.md): AC-70, UX-2, risk R-1;
- [ADR-0043](./ADR-0043-treat-manual-json-as-a-feature-and-split-save-from-apply.md): drafts survive a reload;
- [ADR-0052](./ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md): the session token is not kept in `localStorage`;
- [PR #107](https://github.com/mderkach/metabox/pull/107): one stored record, a document per tab;
- [issue #113](https://github.com/mderkach/metabox/issues/113).
