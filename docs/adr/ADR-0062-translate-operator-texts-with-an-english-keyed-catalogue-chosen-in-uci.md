# ADR-0062. Translate the daemon's operator texts with an English-keyed catalogue, the language chosen in UCI

- Status: Proposed
- Date: 2026-10-24
- Deciders: repository owner

## Context and problem statement

The panel speaks English and Russian, and the user picks the language in the browser (AC-43, [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md)). Daemon failures reach it as codes, and the panel takes the text from its own dictionaries ([ADR-0022](./ADR-0022-report-the-apply-failure-step-as-a-code.md)). ADR-0019 deferred a language setting in the daemon "until a scenario appears that needs it"; this decision ends that deferral for the texts the operator sees, and leaves the panel language as ADR-0019 set it.

The daemon also shows text where there is no panel dictionary in between: `metaboxd -h`, the operator messages of the init scripts (`dp_fail` and the start checks), MCP tool texts that an agent reads and repeats to its user, and the `message` fallback and the `reason` and `detail` texts in API answers, which the panel shows as a detail under the translated cause. #80, #84, #85 and #86 moved all of them to English. On 2026-10-24 the owner set the rule that text the product shows the user in any interaction is internationalised with a language choice, while text developers read (sources, docs, commits, logs) is English; issue #87 records the decisions: the operator chooses the language at install, it is stored as UCI `metabox.main.lang` (`en`, `ru`), it is independent of the panel language, logs stay English, codes do not change.

Facts that constrain the decision:

- one text is used twice: `errNotFound` is the `message` of the answer and the `err` attribute of the log record; `Transaction.Reason` is `err.Error()` of a chain assembled by `fmt.Errorf` wrappers, where only the wrappers are the daemon's words and the tail is an OS or sing-box error;
- the daemon module has one dependency, the MCP SDK, and a new one is a separate decision ([Architecture&Style](../../apps/metaboxd/docs/guides/Architecture&Style.md));
- the daemon is configured only by flags that the procd script fills from UCI; environment variables are not added (same guide);
- the init scripts are POSIX `sh` under `/etc/rc.common` and cannot call the daemon to get a text: they run when the daemon is not running;
- `install.sh` runs before the package is installed ([ADR-0058](./ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md)).

In scope: where the texts and their translations live, how a text is picked by the setting, where the setting lives and how it reaches the daemon and the scripts. Out of scope: the panel dictionaries, codes, logs, the apk package description (stays English, owner's decision), the output of `sing-box check` and of the fork, which the daemon passes on verbatim.

## Decision drivers

- Logs stay English while the same failure reaches the operator in the chosen language.
- A text and its translation cannot drift apart unnoticed: a missing or orphaned translation fails a test, not the screen.
- The English text stays at the place that shows it, as the error and log texts are now.
- No new dependency in the daemon module.
- One way to configure the daemon: a flag filled by the init script from UCI.
- A missing translation shows English, never a key.

## Considered options

1. **An English-keyed catalogue in the standard library** (the gettext model). The call site keeps the English text and passes it through `locale.T`, `locale.Sprintf`, `locale.Errorf` or `locale.New`; the package keeps a map from the English text to the Russian one. A test parses the module sources, collects every literal passed to these calls and to the `flag` definitions, and fails on a text without a Russian entry, an entry no source shows, and an entry whose format verbs differ from the source. Advantages: the code reads as before; the English text lives once; no dependency. Drawbacks: the key is the text, so an edit of the English orphans the entry until it is moved, which the test catches; the text must be a literal, a variable is rejected by the test; the Russian texts of all packages live in one file. **Chosen.**
2. **An identifier-keyed catalogue.** Constants `locale.NotFound` and a table of `[2]string{en, ru}` per key. Advantages: the compiler rejects an unknown key, the array shape forces both languages. Drawbacks: the English text moves from the code into the table, so the error that goes to the log has to be built from the catalogue too, and every package imports the key list; an exported key nobody uses is not caught by the compiler or the linter. **Rejected.**
3. **`golang.org/x/text/message` with `gotext` extraction.** Advantages: a standard catalogue format, plural forms by language rules, an extraction tool. Drawbacks: a new module in the shipped binary against the one-dependency rule; the extraction tool needs `golang.org/x/tools`; plural forms are not needed by the current texts, which carry no counts the operator reads as words. **Rejected.**
4. **Keep English and leave translation to the clients.** Advantages: nothing to build. Drawbacks: `-h`, the init scripts and MCP have no client dictionary, so the owner's rule is not met. **Rejected.**

For the setting:

1. **UCI `metabox.main.lang`, read by the init script and passed as `-lang`.** The daemon keeps its flag-only configuration; a change is `uci set` and a daemon restart, which the existing `procd_add_reload_trigger metabox` already does. **Chosen.**
2. **An environment variable such as `LANG`.** Rejected by the flag-only rule; OpenWrt sets no locale either.
3. **A field in the daemon state, set from the panel.** Mixes the operator's language with the panel user's (ADR-0019 keeps the panel choice per browser) and needs an API; the owner chose the install step. **Rejected.**

## Decision outcome

**The Go catalogue is `apps/metaboxd/internal/locale`.**

- `locale.Lang` is `en` or `ru`; `locale.Parse` rejects anything else. It implements `encoding.TextUnmarshaler`, so `main.go` defines it with `flag.TextVar` as `-lang`, default `en`.
- `locale.T(l, text)` returns the Russian entry for `text` when `l` is `ru` and the entry exists, otherwise `text`. `locale.Sprintf` formats the translated format; a translation may reorder arguments with `%[n]`.
- `locale.Errorf` and `locale.New` build a `*locale.Error`: `Error()` is the English text, the same as `fmt.Errorf` would give, and `errors.Is` and `errors.As` see through it the same way. A translation is rendered by `fmt.Errorf` too, so it may reorder arguments, `%[2]w` included. `locale.Message(l, err)` translates the outer layer when it is a `*locale.Error`, with the errors it formats rendered by the same rule; a layer built otherwise is returned as is with everything under it. So a wrapper is translated and the OS error under it stays English.
- The translations are `ru` in `internal/locale/ru.go`, a map from the English text to the Russian one. English has no table: it is the key.
- A text passed to these calls, and the usage of every `flag` definition outside `cmd/`, is a string literal or a concatenation of literals. `TestCatalogueMatchesSources` enforces this and the three checks of option 1.
- Translation happens at the boundary that shows the text: the flag usage printer (`locale.PrintDefaults`), the HTTP error writer, the MCP tool results. Logs get `err` as before and stay English.
- `metaboxd -h` without `-lang` reads `uci -q get metabox.main.lang` through the `-uci` path, so help typed by hand on the router speaks the configured language; any failure there gives English.

**The setting** is `option lang` in the `main` section of `/etc/config/metabox`, `en` when absent. The `metaboxd` init script reads it and passes `-lang`. `install.sh` asks for it as a step and writes it with `uci`.

**The shell counterpart** is one file in the package that both init scripts source: a function that takes the English text, as a `printf` format, and prints the Russian one for `ru` from a `case` on the text, falling back to English. Messages that interpolate a value pass it as a `printf` argument instead of inside the string, so the text is a fixed key. A Go test in `internal/locale` reads the file and the init scripts and applies the same three checks. `install.sh` cannot source a file of the package it installs, so it keeps its own texts in both languages inline.

What changes nothing: codes (`ErrorCode`, `ReasonCode`, diagnostics reasons) and therefore `daemon.generated.ts`; logs; the output of `sing-box check` and of the fork; the panel and its language choice.

### Scope and boundaries

`apps/metaboxd/internal/locale`, `apps/metaboxd/main.go`, the error and result writers of `internal/httpapi` and `internal/mcp`, the error constructors of the packages whose text reaches the API, `apps/metaboxd/package/etc/init.d/*`, `apps/metaboxd/package/etc/config/metabox`, `install.sh`.

## Consequences

### Positive

- The operator reads `-h`, the init-script messages, MCP texts and API details in the language chosen at install, while the log keeps one language for whoever fixes the failure.
- A forgotten translation or an English edit that orphans one fails the daemon tests.
- No dependency was added.

### Negative

- One text can be mixed: a translated wrapper with an English OS error or sing-box output under it.
- The panel user and the operator are often the same person with two settings: a Russian daemon under an English panel shows Russian details under English causes. The owner accepted this by keeping the settings independent.
- The texts of the `flag` package itself (`invalid value`, `flag provided but not defined`) stay English.
- Russian texts of all packages are in one file away from their call sites, keyed by the English: an English edit means moving the entry too.
- The catalogue test parses the module sources: a text built at run time cannot be translated, and the rule that it is a literal is checked only by this test.
- The mechanism tests swap the package-level map, so they cannot run in parallel.

### Neutral or deferred

- Plural forms: no current text needs them; when one does, it is a separate change, possibly option 3.
- A third language is a third map and a case in `Parse` and in the shell function.
- The texts of `install.sh` are not checked by the catalogue test.

## Risks and mitigations

| Risk                                                                 | Likelihood and impact              | Mitigation                                                                    |
| -------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| A translated text reaches the log through `err.Error()` of a wrapper | low; a Russian log line            | `Error()` of `*locale.Error` is always English; translation only in `Message` |
| A translation drops or changes a format verb                         | medium; `%!` garbage on the screen | the catalogue test compares the verb sets                                     |
| A text passed as a variable escapes the catalogue                    | medium; an English text in Russian | the catalogue test rejects a non-literal argument outside the package         |
| A wrong `lang` in UCI stops the daemon at start                      | low; no panel                      | the init script passes only `en` or `ru`, anything else becomes `en`          |

## Compatibility, migration and rollback

A router without `option lang` gets English, the current behaviour. The flag is new, so an old init script with a new daemon and the reverse both work. API answers keep their shape and codes; only the language of `message`, `reason` and `detail` follows the setting. Rollback: remove `-lang` from the init script, and the daemon speaks English; removing the package is reverting the commits.

## Validation

- `cd apps/metaboxd && go test ./internal/locale/`: the catalogue test over the sources and the init scripts; the mechanism tests for fallback, argument order, the English `Error()` and the translated `Message`.
- `metaboxd -lang ru -h` prints Russian, `metaboxd -h` English; on the router with `uci set metabox.main.lang=ru`, `metaboxd -h` prints Russian.
- On the test bench with `lang ru`: a refused request answers with a Russian `message` and the same `code`; `logread` shows the same failure in English.
- `make schema-daemon` leaves `apps/web/src/shared/api/daemon.generated.ts` unchanged.

## Links

- [PRD, AC-43 and AC-75](../PRD.md);
- [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md): the panel language and the deferred daemon setting;
- [ADR-0022](./ADR-0022-report-the-apply-failure-step-as-a-code.md): codes stay the contract;
- [ADR-0058](./ADR-0058-install-on-a-clean-router-with-a-script-on-top-of-the-apk-repository.md): `install.sh`;
- [Errors and logging](../../apps/metaboxd/docs/guides/ErrorsAndLogging.md), [Architecture and style](../../apps/metaboxd/docs/guides/Architecture&Style.md);
- [`apps/metaboxd/internal/locale`](../../apps/metaboxd/internal/locale/locale.go);
- issue [#87](https://github.com/mderkach/metabox/issues/87).
