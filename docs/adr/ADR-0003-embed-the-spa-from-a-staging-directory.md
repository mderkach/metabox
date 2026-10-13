# ADR-0003. Embed the SPA from a staging directory in the daemon package

- Status: Accepted
- Date: 2026-09-09
- Deciders: repository owner

## Context and problem statement

AC-17 requires the daemon to serve the embedded UI, and [ADR-0040](./ADR-0040-ship-the-panel-as-one-go-daemon-with-an-embedded-spa.md) promises a single delivery artifact: one binary goes to the device. So the built SPA must get inside `metaboxd` through `go:embed`.

The `go:embed` directive cannot reach above its package directory, and the frontend lives in another tree, `apps/web/dist`. It cannot be reached from `apps/metaboxd` directly. The [HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md) guide records this constraint and leaves the choice of delivery method to implementation time; the wording "`go:embed` looks into `apps/web/dist`" from A.10 of the PRD (now [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md)) describes the source, not the path in the directive.

The constraint that drives the decision: **embedding is checked by the compiler**. If the directory named in the directive is missing or contains no matching file, the build fails with `no matching files found`. Not only `go build` fails, but also `go vet`, `go test` and `golangci-lint`, that is, the pre-commit hook, CI steps and any edit of Go code without building the frontend first.

In scope: where the directory used for embedding lives, how it is filled and what of it lives in git. Out of scope: the contents of the SPA itself, caching rules and client-side routing: they are set by the HTTPAPI guide and implemented in `internal/webui`.

## Decision drivers

- The Go part builds, lints and tests on a clean clone without Node installed and without building the frontend.
- The working tree stays clean after a build: `make daemon` produces no changes that git shows as edits to tracked files.
- The frontend artifact does not go into git: it is reproducible from sources.
- The frontend build configuration does not know about the layout of the Go part.
- The method is enforced by a command, not by a convention.

## Considered options

1. **An embed package at the module root, the whole directory outside git**: rejected. The directory is missing on a clean clone, so `go build ./...` and `go test ./...` fail before anyone builds the frontend. The cost is Node and `pnpm install` as a precondition for any edit of Go code, including an edit that does not touch the frontend.

2. **Vite writes the build straight into the daemon tree (`build.outDir`)**: rejected. It removes the copy step but creates a reverse dependency: the frontend configuration starts to know about the Go part's directories, and moving any of them breaks the other's build. It does not solve the empty directory problem on a clean clone at all.

3. **A directory in the daemon package, with only a placeholder file in git, contents put there by `make daemon`**: **chosen**. The placeholder keeps the directory non-empty, so embedding always builds; the real frontend build does not touch it and therefore does not dirty the working tree.

4. **The frontend artifact in git**: rejected. It removes the problem entirely but puts rebuildable binary output into history: every build gives a diff of hundreds of kilobytes, and reviewing such a diff is pointless.

## Decision outcome

The daemon embeds static files from `apps/metaboxd/internal/webui/static`.

Mandatory rules:

- The directive is declared with the `all:` prefix. Without it, embedding skips files starting with a dot, and a directory with only the placeholder stops building again.
- Exactly one file of this directory lives in git: `.gitkeep`. The rest is covered by `.gitignore`; the rule is written there together with its reason.
- `make daemon` fills the directory: first it removes everything except the placeholder, then it copies `apps/web/dist`. Removal is mandatory: otherwise assets of previous builds pile up in the binary, because their names contain a content hash and differ between builds.
- The directory is named `static`, not `dist`: it is the daemon's input, not the output of its build. The name also avoids the `.gitignore` rule for `dist` and the ban on editing `dist` in `.claude/settings.json`.
- A daemon built without the frontend starts and serves the API: `webui.Handler` returns `ErrNotBuilt`, and the HTTP layer serves an explanation at the root that the interface is not built. The panel must work with an incomplete build just as it does with sing-box down (NFR-1).

Non-goal: laying out the frontend build into the daemon directory by means of Vite, and keeping the artifact in git.

## Consequences

### Positive

- Editing Go code does not require Node: `make test`, `make lint` and the pre-commit hook work on a clean clone.
- `make daemon` does not dirty the working tree: the placeholder is not overwritten, and the rest is ignored by git.
- The frontend build knows nothing about the Go part, and the directories can be moved independently.

### Negative

- The build gained a copy step: `make daemon` is no longer just `go build`, and a binary built by hand may contain static files from a previous build.
- The placeholder ends up in the binary. A hundred bytes do not matter, but the file in the artifact is extra.
- The same artifact lives in two places: `apps/web/dist` and the embedding directory.

### Neutral or deferred

- The test bench serves the frontend through Vite with HMR (AC-20), so `make daemon-target` does not copy static files: the daemon on the test bench serves only the API.
- Caching rules and serving the shell on client routes live in `internal/webui` and are not set by this decision.

## Compatibility, migration and rollback

Nothing to break: before this decision the daemon did not serve static files. Existing commands keep their meaning: `make daemon` builds the same binary, only with the interface inside.

Rollback means going back to a binary without a UI and costs removing the `internal/webui` package together with the copy step; neither the data on the device nor the config format is affected.

## Validation

- `go build ./...` and `go test ./...` in `apps/metaboxd` pass on a directory that contains only `.gitkeep`.
- `make daemon` builds the binary, after which `git status` shows a clean tree.
- `make lint` and `make test` are green without building the frontend first.
- The `internal/webui` tests check serving on top of a fake file system: the shell on unknown paths, `immutable` on hashed names, `no-cache` on names without a hash, `ErrNotBuilt` on a directory without `index.html`.
- Manual check on a built binary: the root and a client route serve `index.html`, a hashed asset comes with `immutable`, an unknown endpoint under `/api/` still answers with a JSON error.

## Links

- [`../PRD.md`](../PRD.md): AC-17;
- [ADR-0040](./ADR-0040-ship-the-panel-as-one-go-daemon-with-an-embedded-spa.md): single delivery artifact, [ADR-0045](./ADR-0045-split-document-and-server-state-and-keep-a-folder-per-project.md): repository structure;
- [HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md): the "Serving the SPA" section: caching rules and behaviour on unknown paths;
- [`../../Makefile`](../../Makefile): the `web`, `daemon`, `daemon-target` and `clean` targets;
- [`../../.gitignore`](../../.gitignore): the rule for the embedding directory.
