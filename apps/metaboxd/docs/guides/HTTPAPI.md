# Daemon HTTP layer

Only `net/http`. Since Go 1.22 the standard library router supports methods and wildcards, and middleware is a plain `func(http.Handler) http.Handler` function; chi, gorilla and frameworks give nothing that is missing here, and they cost a dependency in the artifact.

## Routing

```go
func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/status", s.handleStatus)
	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("POST /api/apply", s.handleApply)
	mux.HandleFunc("GET /api/apply/{id}", s.handleApplyState)
	mux.HandleFunc("POST /api/apply/{id}/confirm", s.handleApplyConfirm)
	mux.HandleFunc("/api/", s.handleAPINotFound)
	mux.Handle("/", s.spaHandler())

	return s.middleware(mux)
}
```

Runtime endpoints (the stream, service state, history, the Clash API proxy) are registered conditionally, depending on the wired dependencies, not added as stubs.

The method in the pattern is mandatory: without it a handler written for `GET` answers `POST`. The parameter is read with `r.PathValue("id")`. API endpoints are under `/api/`, everything else serves the SPA.

A failed cycle carries the step code: `Transaction.ReasonCode` says where the apply stopped, `Reason` holds the step's original error. The panel picks the text for the user by the code ([ADR-0022](../../../../docs/adr/ADR-0022-report-the-apply-failure-step-as-a-code.md)).

The set of Apply endpoints is not reinvented along the way: `POST /api/apply`, `GET /api/apply/{id}`, `POST /api/apply/{id}/confirm`, a link to the active transaction in `GET /api/status`.

The dataplane model is changed by the same protocol and endpoints of the same shape: `PUT /api/dataplane` with the body `{model}` (the shape of the `model` field from `GET /api/dataplane`, the whole model) returns 202 and an `apply.Transaction`; `GET /api/dataplane/apply/{id}` returns its state; `POST /api/dataplane/apply/{id}/confirm` confirms it. The link to it is `dataplane_transaction_href` in `GET /api/status`. An invalid model is 422 `dataplane_invalid` with fields, a non-JSON body is 400 with the same code, a config apply in progress is 409 `apply_in_progress`, and vice versa; a daemon on a foreign init script is 409 `dataplane_foreign_service`, and `GET /api/dataplane` warns about it in advance with the `foreign_service` field, by which the panel does not offer a change. `GET /api/dataplane` returns an `ETag`, the `sha256` of the UCI section snapshot, and `PUT` must return it in `If-Match`: without the header 428, section changed after reading 412, both with the code `dataplane_modified`; `*` means a change without comparison. Unlike `POST /api/apply`, the header is mandatory: for the config, without it there is still the comparison with what the daemon itself wrote, while the UCI section has no such base. The handler takes the client address for the warning about removing the administrator from interception from `RemoteAddr`: behind the dev server proxy it holds the proxy address. Protocol: [DeviceIO](./DeviceIO.md), "Model change".

There is no separate endpoint for writing the config, and there will not be one: `GET /api/config` returns the applied config, and only the Apply protocol writes it. A `PUT` bypassing `sing-box check`, the backup and the confirmation window would also bypass the rollback guarantee.

External edits are caught by optimistic locking: `GET /api/config` returns an `ETag`, the `sha256` of the returned bytes, and `POST /api/apply` takes it in `If-Match` and rejects an apply on top of a changed file with the code `config_modified` (409). The comparison with the client's base is done by `apply.Manager`, not by the handler.

## Response shapes

A body that an endpoint returns is declared in `internal/contract` as an exported type, not as a private struct next to the handler. The panel builds its schemas from these types, and the contract must be declared explicitly: a private field gets renamed with no obligations, a promise to the client does not.

A domain type that goes into a response as a whole (`apply.Transaction`, `config.Version`, `route.Explanation`) stays in its package: `contract` references it, it does not copy it.

## Handlers

A handler is a method of the struct with dependencies, and it is thin: parse the request, call the domain code, write the response. It has no disk operations, `exec` or timers.

```go
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	// The body is read under http.MaxBytesReader: the config and, in the envelope, the list files.
	cfg, lists, listsBase, err := readApplyBody(w, r)
	if err != nil {
		fail(s.log, w, r, err)
		return
	}

	tx, err := s.applier.Start(r.Context(), cfg, lists, baseSum(r.Header.Get("If-Match")), listsBase)
	if err != nil {
		fail(s.log, w, r, err)
		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}
```

`r.Context()` goes into the domain code: when the connection drops, its steps are cancelled too. The exception is the apply cycle: it outlives the request, so it gets its own context, not the request context.

The request body is always limited by `http.MaxBytesReader`: the config arrives as bytes, and without a limit one request takes as much memory as was sent.

Responses are written by one helper: status, `Content-Type`, encoding. The error format is single, from [ErrorsAndLogging](./ErrorsAndLogging.md).

## Middleware

The chain is assembled once, the order is outside in:

```go
func (s *Server) middleware(next http.Handler) http.Handler {
	return recoverPanic(s.log,
		logRequests(s.log,
			checkHost(s.log, s.allowedOrigin,
				checkOrigin(s.log, s.allowedOrigin,
					requireSession(s.log, s.auth, next)))))
}
```

`recoverPanic` is outermost, otherwise a panic in logging brings the process down. Each wrapper does one thing and is tested separately. `requireSession` comes after the origin checks: a mutating request from a foreign page gets 403 whether or not there is a session. Without a password the origin check is the only protection of mutating requests.

## Origin check

The rule is not open for discussion in code: on mutating requests the host from `Origin` must match `Host`, a request without `Origin` is rejected. The `-allowed-origin` flag adds an allowed value; the test bench does not use it: the dev server passes the daemon its own `Origin` ([`apps/web/vite.config.ts`](../../../../apps/web/vite.config.ts)).

The second check is `Host`, and it applies to all requests, not only mutating ones: the daemon answers only when it holds an IP literal, `localhost` or the host from `-allowed-origin`. This protects against DNS rebinding: an attacker's domain re-pointed to the router address is same-origin for the attacker's page, the `Origin` check lets such a request through, and the browser allows reading the responses. The downside: the panel does not answer on the router's DNS name until the name is allowed by the flag.

The daemon sends no CORS headers: the UI lives on the same origin, and allowing others means opening the panel to a third-party site. This also applies to the Clash API proxy: the controller's `Access-Control-*` headers are stripped from the response, because with `access_control_allow_origin` unset the fork answers `*`, and passing that on would hand the secret-authorized branch to any site.

## Login

The password is optional ([ADR-0052](../../../../docs/adr/ADR-0052-protect-the-panel-with-an-optional-password-and-a-cookie-session.md)). Its hash, sessions and the guessing lockout are owned by `internal/auth`; the HTTP layer gets them as the `Guard` interface. Without a password `requireSession` lets everything through.

With a password a request without a live session gets 401 `unauthorized`. Exempt: paths outside `/api/` (the health check and the SPA static files), `GET /api/auth`, `POST /api/auth/login`, `POST /api/auth/logout`.

| Endpoint                 | Body                  | Answer                                                                                      |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/auth`          |                       | `{enabled, authenticated}`                                                                  |
| `POST /api/auth/login`   | `{password}`          | 204 and the session cookie; 403 `password_wrong`, 429 `login_locked`, 409 `auth_disabled`   |
| `POST /api/auth/logout`  |                       | 204, the cookie is cleared                                                                  |
| `PUT /api/auth/password` | `{current, password}` | 204; an empty `password` removes the password. 403 `password_wrong`, 400 `password_invalid` |

A wrong password is 403, not 401: the panel answers 401 by showing the login screen, and the refusal must stay in the form where the password was typed. 429 carries `Retry-After` in seconds. Every `/api/auth` answer carries `Cache-Control: no-store`: a cached login state or `Set-Cookie` would outlive the session.

The session is the `metabox_session` cookie with `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` when the request came over TLS: with HTTPS off the panel is served over plain http, and a browser drops a `Secure` cookie on such a page. `EventSource` sends it like any same-origin request. The session is checked when the request starts, and `requireSession` cancels the request context when the session ends, so logout and a password change close the open streams. Sessions are kept in `sessions.json` of the service directory and survive a daemon restart.

## MCP

`/mcp` serves agents over MCP, streamable HTTP without sessions; the server and its tools live in `internal/mcp`, the only package that imports the SDK ([ADR-0055](../../../../docs/adr/ADR-0055-embed-a-read-only-mcp-server-in-the-daemon-with-the-official-go-sdk.md)). The path is outside `/api/`, so `requireSession` does not apply and the panel cookie does not open it; the token is checked by the handler, so it does not open `/api/*`. While MCP is off the path answers as an unknown one, with the panel page; without the token or with a wrong one, 401 `unauthorized` with `WWW-Authenticate: Bearer`. `checkHost` applies as everywhere. `checkOrigin` checks every method on `/mcp`, rejects a foreign `Origin` with 403 and accepts a request without `Origin`: an agent sends none, and a foreign page cannot attach the token header without a CORS preflight.

| Endpoint                | Body | Answer                                                                   |
| ----------------------- | ---- | ------------------------------------------------------------------------ |
| `GET /api/mcp`          |      | `{enabled, endpoint, permissions}`                                       |
| `POST /api/mcp/token`   |      | `{token, endpoint, permissions}`: enables MCP, invalidates the old token |
| `DELETE /api/mcp/token` |      | 204, MCP is off                                                          |

The token is shown once: the daemon keeps its SHA-256 in `mcp.json` of the service directory. The answers carry `Cache-Control: no-store`.

## Server and timeouts

```go
srv := &http.Server{
	Addr:              addr,
	Handler:           s.routes(),
	ReadHeaderTimeout: 10 * time.Second,
	ReadTimeout:       30 * time.Second,
	IdleTimeout:       60 * time.Second,
	ErrorLog:          slog.NewLogLogger(s.log.Handler(), slog.LevelError),
}
```

We do not set `WriteTimeout` globally: it cuts long responses, the Clash API proxy and the `GET /api/events` stream. A deadline is set selectively on a specific response with `http.NewResponseController(w).SetWriteDeadline(...)`.

We listen on the owner's networks and only on them. Addresses come from the `-listen` flag as a comma-separated list, and each one gets its own listener of one `http.Server`; `0.0.0.0` does not appear in the default value. Which networks these are is decided by the device: the package's init script takes the address of each network from `listen_interface` in `/etc/config/metabox` and restarts the daemon on a trigger from any of them.

An address that failed to open does not stop the daemon: router interfaces come up in random order, and the guest network may appear later than the panel. Such a failure goes to the log as a warning, and the daemon works on the remaining addresses. A failure on all addresses is a startup error: there is nothing to listen on.

## HTTPS

The panel is served over plain http by default and over TLS with the `-https` flag ([ADR-0056](../../../../docs/adr/ADR-0056-serve-the-panel-over-https-with-a-root-the-daemon-issues.md)); `-https-cert` with `-https-key` serve a pair the owner already has, read once at start, with no root of the daemon's own and no root file. Otherwise certificates are owned by `internal/cert`: a root issued once and kept in the `tls/` subdirectory of the service directory, and a server certificate under it for the listen addresses, `localhost` and the `-allowed-origin` host. The server certificate is reissued on a TLS handshake when less than thirty days remain, and at start when the addresses changed; the root is reissued only when it is missing, expired or cannot cover a new address, since a new root means trusting the panel again on every device. The router has no real-time clock, so a certificate is never dated before `clockFloor` in that package, and expiry is judged only by a clock past it.

One port serves both protocols: `SplitTLS` sorts each connection by its first byte and hands TLS to one listener and plain http to another, both served by the same `http.Server`. `redirectToTLS` sends a plain request to `https://` on the same `Host` with 308; `/healthz` and `/metabox-ca.crt` stay on plain http, because scripts poll the first without a trust store and the second is what builds that trust store. The middleware goes after `checkHost`, so a foreign name is refused rather than redirected.

`GET /metabox-ca.crt` returns the root in PEM as `application/x-x509-ca-cert`; it is outside `/api/`, so no session is needed. Only HTTP/1.1 is offered in ALPN: the streams and the Clash API proxy are written for it, and HTTP/2 is a separate change.

## Shutdown

```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

go func() {
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("сервер остановлен", "err", err)
	}
}()

<-ctx.Done()

shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
defer cancel()
if err := srv.Shutdown(shutdownCtx); err != nil {
	log.Error("остановка не завершилась", "err", err)
}
```

`ErrServerClosed` is a normal termination and is not counted as an error. After `Shutdown` the background owners stop too: the confirmation window timer writes its state to disk so that it is replayed after start. A process killed by procd on timeout must leave a state on disk from which the automatic rollback will happen.

## Serving the SPA

Static files are embedded with `go:embed`. The directive cannot reach above its package directory: `apps/web/dist` cannot be reached this way from `apps/metaboxd` or `internal/`. `make daemon` copies the build into `internal/webui/static`, and in git this directory is kept non-empty with a placeholder; otherwise the Go part stops building without Node installed.

Serving rules:

- an unknown path under `/api/` is a 404 with an error body, not `index.html`: otherwise the frontend gets HTML instead of JSON and shows nonsense;
- so is any path under `/.well-known/`: after a 401 on `/mcp` some MCP clients request OAuth metadata there, and the shell with 200 would be read as broken metadata;
- other unknown paths get `index.html` with `Cache-Control: no-cache`, routing is client-side;
- files with a hash in the name get `Cache-Control: public, max-age=31536000, immutable`;
- compression is not computed on the fly: the panel build puts `.br` and `.gz` next to each file, the daemon picks the variant by `Accept-Encoding` and sets `Vary: Accept-Encoding`. Compressing the same file on every request costs router CPU time, and the weaker the hardware, the more often it is spent. Both formats, not only brotli: with HTTPS off the panel is served over plain http, and the browser does not announce `br` on such a connection;
- the content type of a compressed variant comes from the original name: by `.br` it would be detected as a byte stream;
- a `.br` or `.gz` itself is not an address: a direct request gets the shell, otherwise the client would see uncompressed bytes.

The daemon does not run HTTP/2: the TLS config offers only `http/1.1` in ALPN. Enabling it is a separate change with the streams and the Clash API proxy checked under it.

## Clash API proxy

The daemon proxies the sing-box Clash API with `httputil.ReverseProxy`. The response is not buffered: the dashboard reads a stream. The daemon inserts the secret, and it does not go out (see the prohibitions in [ErrorsAndLogging](./ErrorsAndLogging.md)). sing-box being unavailable is a normal response with a state, not a 500: the panel must work while the service is down.

The exception is connections and runtime state. Their shape is not passed through as is: the fork has two sources of this data, and the frontend must not know which one worked. The daemon maps both to its own contract and reports the active source in `GET /api/status`. Other Clash API endpoints (rules, groups, DNS query) stay a pass-through proxy: core data goes out as is. Where a claim comes from is shown by the route explanation endpoints; the proxy does not do that.

An upgrade to WebSocket on the proxy branch is rejected: runtime data goes through the `/api/events` stream, and no second path to the same data is added. The fork returns the `/traffic` and `/memory` streams without an upgrade too, as a line-by-line chunked response, so the daemon has no WebSocket client at all.

## Runtime stream

`GET /api/events` returns `text/event-stream` with the envelope `{topic, seq, data}`; the topics are `traffic`, `memory`, `connections`, `service`, `system`. Rules the stream handler must follow:

- `seq` is shared across all topics and grows without gaps for each reader: by a gap the panel knows an event was lost and requests the state again. The envelope carries no time: the router has no real-time clock.
- Upstreams are held as one set for all readers, not one set per subscription. When the last reader leaves, polling stops.
- A new subscriber gets the last event of each topic immediately, otherwise the screen stays empty until the next poll period.
- The subscriber queue is bounded: overflow drops an event instead of accumulating it. The daemon runs for months, and an unbounded queue is more dangerous than a missed sample.
- The buffer is flushed through `http.NewResponseController`, not by a cast to `http.Flusher`: middleware wraps `ResponseWriter` in its own type, which lacks the method.

## Log and diagnostics

`GET /api/logs?lines=200&level=info` is the tail of the sing-box log: `{source, since?, entries: [{time?, level?, message}]}`, oldest lines first. `lines` is from 1 to 1000, `level` is the minimum level `trace`…`panic`, case-insensitive; anything unparsed is 400 `log_query_invalid`. The source cannot be read: 503 `log_unavailable`, the reason stays in the daemon log.

`GET /api/logs/stream?level=` is SSE, the `log` event with `{seq, entry}`. It works like `/api/events` (flush through the controller, a deadline on each write, a comment every 20 seconds, a bounded queue that drops a line and breaks `seq`), but each reader has its own source: a `logread -f` process or file polling. So there are at most four streams, the fifth gets 429 `log_stream_limit` with `Retry-After: 5`. A slot is freed when the client closes the connection; a client that vanished without closing is dropped by the 30-second `TCP_USER_TIMEOUT` that the listener sets on Linux; otherwise a stream with a `logread` process would live until TCP retries are exhausted.

`POST /api/logs/clear` takes `{since}`: a mark before which lines are not shown, and with a `log.output` file also truncation. A file outside the allowed directories is 409 `log_clear_forbidden`. What exactly is cleared: [DeviceIO](./DeviceIO.md), "sing-box log".

`GET /api/diag?proxy=<node>` is a report `{checks: [{name, status, reason?, detail?, missing?, delay_ms?}]}` in a fixed order. `status` is `ok`, `fail` or `skipped`; a failed check is a report row, not an HTTP code. The panel picks the row text by `name` and `reason`, `detail` is a detail in the daemon's language. What is checked: [DeviceIO](./DeviceIO.md), "Dataplane diagnostics".

## Tests

Rules: [Testing](./Testing.md): `httptest` for the server and for a single handler, fakes instead of domain dependencies.
