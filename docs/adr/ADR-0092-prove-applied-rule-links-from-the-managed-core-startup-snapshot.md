# ADR-0092. Prove applied rule links from the managed core startup snapshot

- Status: Proposed
- Date: 2026-11-22
- Deciders: metabox maintainers

## Context and problem statement

The route explanation gets the condition and action from the core. The Clash API lists rules in order but does not identify the file revision that produced the list. Two configs can have the same number of rules, or even render the same runtime strings, while carrying different rule names. An edit to the panel's draft can also shift positions after a correct match against the applied file.

## Decision drivers

- Keep observed routing facts available for managed and external cores.
- Attach names and positional navigation only to the same file and rule position.
- Keep Apply and rollback, the working directory and logging compatible with existing installs.
- Keep one check for the route explanation and MCP, without background runtime polling.

## Considered options

1. **Compare list length or rendered rules.** Cheap and available on older installs. An equal-length reorder invalidates the first test. No runtime rule string identifies a comments-only change. Rejected.
2. **Hash the original file around process startup.** Uses the existing service command. It cannot show what a process actually opened, and the same process can reread the mutable file after SIGHUP. Rejected.
3. **Expose the loaded digest and matched rule index from the core.** A direct contract would be stronger and simpler for the daemon. The pinned fork does not expose these fields. A fork change would need separate delivery and compatibility work. Deferred.
4. **Start the managed core from a private snapshot and prove its use.** Requires a launcher and a small runtime snapshot. The daemon can identify the actual file independently of later edits and keep the observed result when evidence is unavailable. Chosen.

## Decision outcome

The service launcher takes a private copy of the single config before executing the core, with its digest and the process identity in the snapshot path. The original working directory still resolves relative paths. The snapshot survives for the process lifetime, including SIGHUP. The normal service restart captures the applied file again. If the snapshot cannot be created, the launcher can still start the core from the original file.

On demand, the daemon binds the applied bytes and the exact managed process to a local controller listener before and after reading the connection and rule list at the same endpoint. It confirms a position only when a single terminating runtime rule matches, and the ordered list has the expected number of entries in the proved revision. The daemon keeps the observed condition and action and omits the reference on any failed check. The same proof selects names for MCP, where the result masks URLs and removes invisible and control characters.

The optional applied reference carries a zero-based index and the applied file's strong ETag. The panel can read applied metadata when that ETag matches. Positional links carry the ETag so the editor can recheck its current document before opening a row. A conflicting draft or revision change opens the general list.

## Consequences

### Positive

- Same-length reorders and edits to comments do not attach names from the wrong document.
- The route explanation and MCP use the same evidence, and the guide can consume the same reference.
- Proof is computed on demand. The daemon does not add a poll to keep it current.

### Negative

- A managed start takes an extra temporary copy and hash of the config. The copy is bounded and stale snapshots are cleaned up on later starts.
- Direct SIGHUP rereads the startup copy. To load edits to the applied file, use the managed service restart.
- Foreign processes, old launchers and configurations outside the proof's supported local controller layout only supply observed information.

## Compatibility, migration and rollback

Wire fields are additive. Existing installations can keep using route explanation and MCP before the managed core has started with the new launcher. Upgrading requires no rewrite of the applied config or its history. Rolling back the package returns to the previous launcher and leaves the on-disk config as the service input.

## Validation

- Route tests verify a confirmed rule, equal-length reorder, ambiguous rule strings, process restart and listener replacement.
- MCP tests verify indexed names and masking. Web tests cover stale revisions, dirty drafts and old daemon frames.
- The disposable Apply bench checks the actual managed process command, snapshot permissions and bytes alongside the existing working-directory invariant.
- Governed files include `apps/metaboxd/package/lib/metabox/core-start`, `apps/metaboxd/internal/singbox/revision.go`, `apps/metaboxd/internal/route/revision.go`, and the route reference helper and editor guard in Web.

## Links

- [Route explanation from observed data](./ADR-0007-explain-route-without-own-rule-evaluator.md)
- [Managed core service](./ADR-0069-manage-only-the-metabox-singbox-service.md)
- [Overview routing rules delta](../../openspec/changes/overview-for-newcomers/specs/routing-rules/spec.md)
