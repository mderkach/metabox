# Errors and logging

Error and log texts of the daemon are in English. The panel does not show them as the failure: it picks the text in the user's language by the code, and the daemon text stays a fallback and a detail for whoever fixes the failure.

## Return an error, do not log it

One failure is one log record, at the top level. Lower levels add context by wrapping and pass the error up:

```go
func (s *Store) Write(cfg []byte) error {
	tmp, err := os.CreateTemp(s.dir, ".metabox-*")
	if err != nil {
		return fmt.Errorf("temporary file in %s: %w", s.dir, err)
	}
	...
}
```

Context says what was being done and to what, without the words "error" or "failed" and without a capital letter: the string is assembled into a chain and read as a whole. No punctuation at the end. The message language is one for the whole daemon; do not mix languages.

`%w` is used when the caller can react to the original error or when it carries data (`*exec.ExitError`, `fs.ErrNotExist`). `%v` is used when an error of a foreign package becomes an implementation detail and its type must not leak into the contract.

Do not wrap and log at the same time, do not return `nil` together with an invalid value, do not lose `Close` errors on writes: that is where the fact of an incomplete write gets lost.

## Sentinels and types

A sentinel is used when the fact of failure is informative by itself:

```go
var (
	ErrNoTransaction  = errors.New("no active transaction")
	ErrConfigModified = errors.New("file changed outside metabox")
)
```

A type is used when the error carries data that the caller or the user needs. For `sing-box check` this is mandatory: `stdout`, `stderr` and the exit code are passed on verbatim.

```go
type CheckError struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

func (e *CheckError) Error() string {
	return fmt.Sprintf("sing-box check: exit code %d", e.ExitCode)
}
```

Checking: `errors.Is` for sentinels, `errors.AsType` for types (Go 1.26, a type-safe replacement for `errors.As`):

```go
if checkErr, ok := errors.AsType[*CheckError](err); ok {
	writeJSON(w, http.StatusUnprocessableEntity, checkResponse(checkErr))
	return
}
```

Comparing errors by text (`strings.Contains(err.Error(), ...)`) is forbidden: the text is part of the message to the user, not a contract.

`errors.Join` is used when there are several steps and all results are needed at once: a rollback that could neither restore the backup nor restart the service must report both halves.

## Errors at the HTTP boundary

An internal error does not go into the response body as is: paths on disk, command arguments and config contents are unnecessary for the client and a gift to whoever got to the panel. What goes out is a code, a stable machine identifier, and a text fit for display.

```go
type Error struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
	Details any       `json:"details,omitempty"`
}
```

The set of codes is closed and declared as an enumeration in `internal/contract` next to the type itself, not as strings scattered across handlers. The reason is not tidiness: the panel picks the text in the user's language by the code, so a new code is a contract change, and it belongs in the same place as the other promises to the client. Every code has godoc: it also explains the failure to whoever will write the text for it.

The value set of the named type goes into the contract schema as a list, and the panel types its tables with it: a missing code is a compile error in the panel ([ADR-0021](../../../../docs/adr/ADR-0021-print-contract-enumerations-as-value-lists.md)). Parsing the response stays tolerant: a value outside the set must not take the screen down.

The same reasoning gives the rule for `Message`: it is in English, the daemon's language, and serves as fallback text. The panel shows it only when it does not know the code, for example when the panel is older than the daemon. The daemon returns no localized strings and does not know the client's language ([ADR-0019](../../../../docs/adr/ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md)).

There is exactly one exception: the output of `sing-box check` is returned verbatim, the user fixes the config from it.

The mapping of errors to HTTP codes is kept in one place, the API package, not in every handler. A panic in a handler is caught by middleware, logged with the stack and turned into a 500 with the `internal` code and the fallback text, without panic details.

## Logs

`log/slog`, one logger, passed explicitly through the constructor. `slog.Default()` and the package-level functions are not used in daemon code: they hide a dependency.

Output goes to stdout: procd starts the daemon with `procd_set_param stdout 1` ([`package/etc/init.d/metaboxd`](../../package/etc/init.d/metaboxd)) and routes the stream to syslog itself. The daemon creates no log files of its own: the system owns rotation.

The default format is `slog.NewTextHandler`: readable in `logread` and smaller in volume. JSON is behind a flag, in case external collection is needed. `slog.NewMultiHandler` (Go 1.26) allows both outputs at once, but do not add it without a real consumer.

The level is set by a flag through `slog.HandlerOptions.Level` and defaults to `Info`.

| Level | When                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| Error | A failure visible to the user or needing intervention: the rollback failed, the service did not come up                         |
| Warn  | A safeguard fired: the config was changed externally, a request was rejected by `Origin`, a transaction is replayed after start |
| Info  | Lifecycle events: start, apply, confirmation, service restart                                                                   |
| Debug | Step details, off by default                                                                                                    |

## Attributes

Write key-value pairs, not a formatted string:

```go
s.log.Info("apply started", "transaction_id", tx.ID, "sha256", sum[:12], "size", len(cfg))
s.log.Error("service restart", "err", err)
```

An error goes as a value under the `err` key, it is not glued into the message. Keys are stable and in snake case when they have two words: `transaction_id`, `exit_code`. The message describes the event, it does not list the filled fields.

A logger with shared fields is created once through `With`: `log := s.log.With("transaction_id", tx.ID)`, then every record of the step carries the identifier.

`slog.LogAttrs` with typed attributes is needed only on the hot path (the Clash API proxy, the connection stream), where otherwise every record allocates. In the apply loop readability matters more.

## What never goes into logs

- `secret` from `experimental.clash_api` and any tokens: not in the message, not in an attribute, not in a config dump;
- the whole content of `config.json`: it holds server addresses and user keys. Write `sha256` and the size;
- request and response bodies; the `Authorization` header;
- what is already logged higher up the stack. A double record of one failure breaks log reading.
