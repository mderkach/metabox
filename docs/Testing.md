# Testing principles

Shared by every project in the repository. How a project applies them with its own tools:

- daemon and schema generator: [`apps/metaboxd/docs/guides/Testing.md`](../apps/metaboxd/docs/guides/Testing.md);
- frontend: [`apps/web/docs/guides/testing/`](../apps/web/docs/guides/testing/README.md).

## What a test checks

- Behaviour and contract, not implementation: the API answer, the file on disk, what the user sees. The internal state of a unit is not a subject of a test.
- A failure is checked together with what it must leave untouched: the target file after a rejected write, the draft after a failed apply.
- One behaviour has one test, at the lowest level that can show it broken. A check that moved to a lower level is removed from the upper one.
- Test names and failure messages are in English and read as a specification: `check failure leaves the file unchanged`.

## Boundaries

- Only what the project does not own is replaced: network, external processes, the service manager, the clock, browser APIs the environment lacks. Our own logic is not mocked.
- A replacement is a plain fake next to the tests that use it, not a generated mock.
- A test uses the project's real constants, schemas and dictionaries, not their copies.

## Determinism

- Each test owns its state: a temporary directory, a query client, a browser context. Tests run in parallel only when they share nothing.
- A test does not wait real time: timers run on a fake clock. Real-time waits are only for real external processes, and they are bounded.
- No snapshots. A reference file is kept only for deterministic generated output, and it is updated by a command or flag, never by hand.
- A skip marks an environment the test cannot run in, such as a missing bench; it never hides a failure. Focused tests do not get into a commit.
