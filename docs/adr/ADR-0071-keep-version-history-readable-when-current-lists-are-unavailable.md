# ADR-0071. Keep version history readable when current lists are unavailable

- Status: Proposed
- Date: 2026-10-31
- Deciders: repository owner

## Context and problem statement

`GET /api/config/versions` reads saved history and then fingerprints the current config and list files to identify the current version. A failure to read the current lists returns an error for the whole request, even when the saved history is readable. Issue #164 records this failure and missing coverage of the snapshot copy fallback already required by [ADR-0036](./ADR-0036-keep-rule-set-snapshots-beside-config-versions.md).

Simply omitting `current_lists_sum` is ambiguous: the panel also accepts responses from older daemons without list fingerprints and compares the config alone. Reading history and proving that a saved version matches the device are separate operations. Restore remains an ordinary Apply and must retain its existing checks.

## Decision drivers

- Keep readable history accessible under the failure described by [AC-15](../PRD.md#5-functional-requirements-acceptance-criteria).
- Distinguish unavailable current lists from an older daemon and from an empty, readable list set.
- Avoid a false current-version badge or a promise that restore will succeed.
- Preserve cancellation, other request failures and the Apply safety boundary.
- Extend the existing contract without a storage migration or a new dependency.

## Considered options

1. **An optional `current_lists_unavailable` boolean.** Explicitly identifies the one partial-success condition, while missing or false preserves the older response interpretation. Old panels ignore it, so their current-version badge can remain misleading. **Chosen** for the bounded failure and small contract change.
2. **An optional status enum or a nullable `current_lists_sum`.** An enum can distinguish more states later; an explicit null can distinguish a failed fingerprint from an absent legacy field. Both are workable, but add states or change the hash field's type when this decision needs only one unavailable condition. Older panels still require an update to interpret the distinction. **Rejected** for this scope.
3. **Keep an error response with a precise error code.** Clients never mistake incomplete comparison metadata for a complete answer, but readable history remains inaccessible unless the client receives it through a second request or an additional error-body contract. **Rejected** because the current list read is not needed to inspect saved versions.

## Decision outcome

When history and the current config have been read successfully, a genuine current-list read failure returns HTTP 200 with the saved `versions`, the usual `current_sum` when a config exists, and `current_lists_unavailable: true`. It omits `current_lists_sum` and logs the underlying failure at warning level; the response does not expose the filesystem error detail.

A readable list set, including an empty set, retains its fingerprint and omits the marker. Context cancellation or deadline expiry follows the existing request failure handling. Failures to read history or the current config retain their existing behavior; an absent config remains supported as before.

The panel carries the marker separately from the version rows. When true, it shows a translated warning even for empty history and marks no row as current, including legacy versions without `lists_sum`. When the marker is absent or false, existing fingerprint and older-daemon behavior is preserved. The warning describes unavailable comparison; it does not promise that restoring a version will succeed.

### Scope and boundaries

The change covers the versions response, generated daemon contract and panel history model and dialog. Restore with an unreadable current list set still fails before Apply starts. Snapshot layout, retention, hard-link reuse and copy fallback remain governed by ADR-0036. Injecting a failed link operation in a private test seam verifies that existing fallback; it introduces no filesystem policy.

## Consequences

### Positive

- Users can inspect readable saved history while the current list set is unavailable.
- Updated panels distinguish an unknown current state from a confirmed match and from older-daemon responses.
- The warning log retains the failure detail for diagnosis.

### Negative

- HTTP success no longer means that every current-state comparison input was readable; clients must inspect the marker.
- An older panel ignores the marker and can still mark a legacy version without `lists_sum` as current from the config hash alone.
- Restore may fail even though the history list loaded successfully.

### Neutral or deferred

- Restoring lists, Apply validation and snapshot storage are unchanged.
- Additional partial-success states and a general status enum are deferred.

## Compatibility, migration and rollback

No config or history migration is required. The marker is optional and emitted only when true. An updated panel connected to an older daemon keeps its existing behavior; an older panel connected to the updated daemon has the badge limitation above, but cannot bypass server-side Apply checks. Rolling back the daemon restores the whole-request failure for unreadable current lists. Rolling back the panel removes the warning and conservative badge behavior; stored versions remain readable.

The daemon API change requires `!` in the commit header under [CONTRIBUTING](../../CONTRIBUTING.md#commit-format), even though the field is additive.

## Validation

These checks define the required evidence; they do not claim a device run:

- `cd apps/metaboxd && go test ./internal/httpapi`: unreadable current lists return history, the marker and no list fingerprint, with one warning; empty history behaves the same; readable lists omit the marker; history/config failures and cancellation do not become partial success; restore still refuses an unreadable current list set before Apply.
- `cd apps/metaboxd && go test ./internal/config`: `TestSaveVersionListsCopiesAfterLinkFailure` injects `EXDEV` and checks independent inodes, identical bytes, private file and directory permissions, and survival after removing the preceding snapshot. The existing `TestSaveVersionSnapshotsLists` checks that a snapshot survives later changes to the working lists.
- `make schema-daemon`: regenerate the optional boolean in the panel contract.
- `pnpm --filter web exec vitest run --project unit Config.adapter ConfigApplyHistory`: cover the warning with populated and empty history, conservative current badges, absent/false marker compatibility, and restoration error handling.
- `pnpm --filter web build`: check the panel against the generated contract.

## Links

- [PRD](../PRD.md): AC-15.
- [ADR-0036](./ADR-0036-keep-rule-set-snapshots-beside-config-versions.md): snapshot storage, metadata and restore safety.
- [Versions handler](../../apps/metaboxd/internal/httpapi/httpapi.go), [daemon contract](../../apps/metaboxd/internal/contract/contract.go).
- Issue: mderkach/metabox#164.
