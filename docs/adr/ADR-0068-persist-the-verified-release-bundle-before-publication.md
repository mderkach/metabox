# ADR-0068. Persist the verified release bundle before publication

- Status: Proposed
- Date: 2026-10-25
- Deciders: repository owner

## Context and problem statement

The release workflow builds and signs a package, then uploads four public files to a GitHub Release: the package, its SHA256 file, the public signing key and the installer. Creating the release and uploading its files are separate requests. A failure can leave an incomplete release, and a retry runs on a fresh runner without the original files. A new signed package is not assumed to be byte-identical to the first one, so comparing existing assets against a rebuild does not provide a reliable retry path.

The package feed is rebuilt from published releases and already excludes drafts ([ADR-0057](./ADR-0057-publish-the-apk-repository-on-github-pages-rebuilt-from-releases.md)). The CI gate for the tagged commit stays in force ([ADR-0054](./ADR-0054-run-ci-checks-as-parallel-jobs-behind-a-summary-job-and-key-the-go-cache-by-the-tool-pins.md)). The private signing key must not enter the release or its recovery artifact.

## Decision drivers

1. Recover a partially uploaded release after the original runner is gone.
2. Keep published releases and already uploaded assets immutable.
3. Prevent the package feed from observing an incomplete release.
4. Bind recovered bytes to one repository, tag, full commit and original workflow run.
5. Use documented GitHub interfaces without adding an application dependency or handling a private signing key outside the signing step.

## Considered options

1. **Persist the verified public bundle as an immutable Actions artifact, then publish through a draft.** A retry restores the original bytes instead of rebuilding. Adds one pinned official action and depends on artifact retention. **Chosen**: satisfies all five drivers with the existing GitHub infrastructure.
2. **Make every package and signature reproducible, then rebuild on retry.** Avoids artifact retention, but requires proving and preserving determinism across the compiler, frontend build, package metadata and signing. **Deferred**: outside the scoped publication fix, and not a verified property of the current build.
3. **Use the draft's uploaded assets as the recovery source.** Avoids an artifact action, but an interrupted upload may leave only part of the four-file bundle; reconstructing the missing files by rebuilding mixes unverified builds. **Rejected**: does not guarantee driver 1.
4. **Keep direct publication.** No extra storage or action, but a failed upload leaves a published incomplete release and a retry cannot safely replace its assets. **Rejected**: drivers 1–3.

## Decision outcome

The release job is serialized by tag with cancellation disabled. Before any release creation or asset upload, it persists all four verified public files with a SHA256 manifest in one Actions artifact. The manifest contains the repository, tag, full checked-out commit and original workflow run ID. Only the public key is copied; the private signing key remains confined to the signing step.

The official `actions/upload-artifact` action is pinned to commit `cf430e030ddbb5b0abf93d22962f4752f3646cd9` (v7), with overwrite disabled, missing files treated as an error and retention set to 90 days within repository policy. GitHub's documented REST artifact API supports reading, downloading and deleting artifacts, but does not provide an upload endpoint; the existing `gh` CLI restores the selected artifact, so no second action or npm dependency is needed. The release job gains `actions: read` for that lookup and download.

A rerun of the original workflow run looks up this exact artifact before build setup. It validates the artifact run and commit metadata, the manifest identity, exact public file set and file hashes, then restores the original package and skips building and signing. The normal signature and architecture check runs again. If no artifact exists and no release exists, the workflow can start a new build. If a release already exists, a missing or expired original artifact fails with a recovery diagnostic instead of rebuilding. New workflow runs for an existing draft are not a recovery path; the draft notes link to the original run to rerun.

Publication creates an empty draft explicitly targeting the checked-out commit. It uploads only missing files, refuses a different draft commit, unexpected asset or changed asset, downloads and compares the complete four-file set, then publishes. An already published release is left untouched and causes a refusal. The package feed keeps excluding drafts.

## Consequences

### Positive

- Partial upload recovery works from a fresh runner without requiring deterministic signed rebuilds.
- Existing assets are never replaced to make a retry pass.
- Upload failure leaves a draft outside the package feed.
- Recovery artifacts contain no private signing material.

### Negative

- One additional official GitHub action and artifact storage are required.
- Recovery ends when the original artifact expires or is deleted; the workflow fails safely at that boundary.
- Operators must rerun the original workflow rather than trigger a new publication for the same draft.

### Neutral or deferred

- Package reproducibility and signing-key recovery remain separate work.
- No repository settings, secrets, tags or existing releases are changed by this decision's implementation or its regression tests.

## Compatibility, migration and rollback

Existing published releases remain untouched. Drafts created before this workflow have no verified bundle and cannot be resumed automatically. Reverting the workflow removes the recovery path but must not delete release assets or overwrite an existing release. An expired or missing bundle requires owner investigation; the workflow does not invent replacement bytes.

## Validation

`python3 .github/tests/test_release_publish.py` exercises initial publication, partial upload and retry from a fresh workspace with restored original bytes, artifact expiry and absence, wrong tag or commit, corrupted files, exact public file selection, API failures, concurrent first attempts and same-tag workflow serialization. `bash -n .github/scripts/publish-release.sh` checks shell syntax. These are mocked GitHub tests; they do not publish a live release or prove artifact transport and package signing on the runner.

## Links

- [Release workflow](../../.github/workflows/release.yml).
- [Bundle creation and recovery](../../.github/scripts/release-bundle.py).
- [Draft publisher](../../.github/scripts/publish-release.sh).
- [Release procedure](../Maintaining.md#release).
- [Official upload-artifact action at the pinned commit](https://github.com/actions/upload-artifact/tree/cf430e030ddbb5b0abf93d22962f4752f3646cd9).
- [GitHub artifact REST API](https://docs.github.com/en/rest/actions/artifacts).
- [GitHub CLI artifact download](https://cli.github.com/manual/gh_run_download).
