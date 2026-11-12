# ADR-0074. Keep the release bundle in the draft release instead of an Actions artifact

- Status: Proposed
- Date: 2026-11-12
- Deciders: repository owner

## Context and problem statement

[ADR-0068](./ADR-0068-persist-the-verified-release-bundle-before-publication.md) saves the verified public files as an Actions artifact of the release run and relies on "rerun the original run" to restore them. The rc.10 release ([run 41328436212](https://github.com/mderkach/metabox/actions/runs/41328436212)) shows that this recovery does not work:

- attempt 2 uploaded the artifact `release-v0.1.0-rc.10-2c3a345f…` (artifact ID 13091993228, `Persist verified publication bundle` succeeded) and failed later in `Publish`;
- attempt 3, started about a minute later, listed the artifacts of the run through `actions/runs/{id}/artifacts`, found none and stopped with "original verified publication bundle is unavailable";
- attempt 4 had to build and sign again; its upload with `overwrite: false` succeeded under the same name and got a new ID (13092557672), so the attempt 2 artifact no longer existed. `GET /actions/artifacts/13091993228` now returns 404; the run lists one artifact.

So the artifact of an earlier attempt of a re-run run did not survive the next attempt. GitHub's pages on [re-running workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs) and the [upload-artifact](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/README.md) README say nothing about artifacts across attempts; they only state that jobs left out of a re-run keep their outputs and that v4 artifacts are immutable unless deleted. The behaviour is observed, not documented, and was observed only for a full re-run of a run; `gh run rerun --failed` was not tried (and must not be tried on a release run to find out).

The existing guard makes this worse: with a draft present and no bundle, `release-bundle.py restore` refuses to rebuild, so after a lost artifact the only way forward is to delete the draft by hand.

Out of scope: package reproducibility and signing-key handling (deferred by ADR-0068).

## Decision drivers

1. Recover a partially uploaded release without depending on how GitHub treats artifacts across attempts.
2. Keep published releases and assets immutable; never let the package feed see an incomplete release.
3. Bind recovered bytes to one repository, tag and commit.
4. No new dependency or action; documented interfaces only.
5. The private signing key stays confined to the signing step.

## Considered options

1. **Keep the Actions artifact and document that it may disappear.** No change; recovery then needs a manual draft deletion after every re-run. **Rejected**: fails driver 1 on the evidence above.
2. **Split build and publish into two jobs and re-run only the failed job.** The artifact would be created by a job that is not re-run. **Rejected for now**: whether artifacts of a kept job survive `--failed` is undocumented and cannot be checked without touching a release run; it also leaves "rerun the original run" as the only entry point.
3. **Keep the bundle in the draft release itself, with the manifest as the completion marker.** The draft is not visible to the package feed ([ADR-0057](./ADR-0057-publish-the-apk-repository-on-github-pages-rebuilt-from-releases.md)) and survives any workflow rerun or new run. **Chosen**: uses the storage the publication already writes to and removes the dependency on artifacts.
4. **Make builds reproducible and rebuild on retry.** Removes storage altogether but is not a verified property of the current build. **Deferred**, as in ADR-0068.

## Decision outcome

The publisher stages the bundle in the draft before the draft can be published:

1. Create the draft as today (explicit target commit, notes with the run link).
2. Upload the package, its SHA256 file, the public key and `install.sh`, then upload a fifth asset, `release-bundle.json`, last. It holds the repository, tag, full commit, run ID and the SHA256 of the four files. Its presence means the bundle is complete.
3. Publish only after downloading all assets and comparing them with the manifest, as today.

On any later run for the same tag (new run, `rerun`, `rerun --failed`):

- draft with `release-bundle.json`: validate the manifest identity and hashes, restore the four files from the draft, skip the build and signing, re-run the signature and architecture check, continue to publication;
- draft without `release-bundle.json`: no consumer can depend on it. Delete its assets, build, sign and stage again; the new bundle replaces the incomplete one;
- no draft: create one;
- published release: refuse and touch nothing, as today.

The Actions artifact step is removed together with `actions: read` and the `upload-artifact` pin. `release-bundle.py` keeps the manifest creation and validation and reads the assets from the draft instead of the artifact API. `publish-release.sh` allows `release-bundle.json` as the fifth asset.

Non-goals: changing the published asset set the feed and `install.sh` rely on is not required; `release-bundle.json` is published with the release as a small extra file. Whether to delete it from the release after publication is an open question.

## Consequences

### Positive

- Recovery no longer depends on artifact retention or on behaviour GitHub does not document.
- A re-run or a new run for the same tag completes the same draft; the manual draft deletion after a lost artifact disappears.
- One storage for the bundle and the release; fewer moving parts than artifact plus draft.

### Negative

- An extra public file in every release unless it is removed after publication (needs a post-publication delete, with its own failure mode).
- Deleting assets of an incomplete draft is a destructive step in the publisher; it is limited to unpublished drafts of the same tag on the same commit.
- Assets are signed bytes of a possibly different build when an incomplete draft is rebuilt. This is acceptable only because nothing public referenced the earlier bytes.

### Neutral or deferred

- Reproducible builds and signing-key recovery stay separate work.
- The leftover rc.10 draft is handled by the owner, outside this decision.

## Compatibility, migration and rollback

Drafts created before this change have no manifest and are treated as incomplete: their assets are replaced by a fresh build. Published releases are untouched. Rollback is reverting the workflow and scripts; it leaves drafts and releases as they are.

## Validation

Extend `python3 .github/tests/test_release_publish.py` with: staged draft restored on a fresh workspace without any artifact; incomplete draft rebuilt after its assets are removed; manifest identity or hash mismatch refused; published release refused. The mocked tests do not prove behaviour on a live runner; the first real release after the change is the live check, with the draft inspected before publication.

## Links

- [ADR-0068](./ADR-0068-persist-the-verified-release-bundle-before-publication.md), which this decision would supersede in part (the artifact storage and the recovery by rerun).
- [Release workflow](../../.github/workflows/release.yml), [bundle script](../../.github/scripts/release-bundle.py), [draft publisher](../../.github/scripts/publish-release.sh).
- [Release procedure](../Maintaining.md#release).
- Run [41328436212](https://github.com/mderkach/metabox/actions/runs/41328436212), attempts 2–4.
