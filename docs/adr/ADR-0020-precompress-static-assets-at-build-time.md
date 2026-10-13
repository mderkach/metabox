# ADR-0020. Compress static assets in the panel build, not in the daemon

- Status: Accepted
- Date: 2026-09-16
- Deciders: repository owner

## Context and problem statement

The daemon served the embedded SPA as is: `http.FileServerFS` without compression. The first visit to the panel is 1193 KB across 31 files, of which 1099 KB is JavaScript. The figures were measured on the built binary with `curl`.

The question came up together with localization ([ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md)): there are now fifty dictionaries, they are small, and serving them without compression and without a permanent cache would mean re-requesting text on every visit.

Constraints set earlier:

- the daemon's `go.mod` is kept without `require` — a new dependency needs a separate decision ([daemon Architecture&Style](../../apps/metaboxd/docs/guides/Architecture%26Style.md));
- static assets live inside the binary, which is installed on the router as an apk package ([ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md)), so binary size is space in the device flash;
- NFR-4 limits the daemon: RSS ≤ 64 MB, idle CPU ≤ 1% of one core;
- the panel is served over plain http in the local network, it has no TLS.

In scope: how compressed static assets reach the browser. Out of scope: compression of API responses: they are small and go one at a time.

## Decision drivers

- The router's CPU time per request does not grow: the device is weaker than any client that talks to it.
- The daemon gets no new dependencies.
- Works over plain http, without TLS.
- A client that does not accept compressed content gets the original file.
- Flash space is spent deliberately and measurably.

## Considered options

1. **Precompression in the panel build, variant selection in the daemon** — the build puts `.br` and `.gz` next to the file, the daemon picks by `Accept-Encoding` and sets `Vary`. Pros: per request the daemon spends as much as before — it reads a file and serves it; maximum-quality brotli is computed once in the build, where time is cheap; neither the daemon (variants are only read) nor the panel (brotli is in Node) gets dependencies. Cons: the binary holds second copies of files. **Chosen.**

2. **On-the-fly compression in the daemon** — `compress/gzip` from the standard library, a middleware on top of serving. Pros: the binary does not grow, `.br` is not needed. Cons: the same file is compressed on every request, and the weaker the hardware, the more it hurts; the standard library has no brotli, so the best format cannot be had this way at all. **Rejected.**

3. **On-the-fly compression with an in-memory cache of compressed data** — compress once and keep the result. Pros: the binary does not grow, CPU is spent once. Cons: compressed static assets move into RSS, which NFR-4 limits, and stay there for the whole daemon lifetime for the sake of data known already at build time. **Rejected.**

4. **Enable HTTP/2** instead of compression or together with it. Pros: multiplexing, no limit of six connections per origin. Cons: in the browser HTTP/2 works only over TLS — no browser supports cleartext (h2c, `Protocols.SetUnencryptedHTTP2` in the Go standard library). TLS on the router means a self-signed certificate and a warning on every visit. In a local network with RTT under a millisecond the gain from multiplexing is close to zero, and it does not reduce traffic at all. **Rejected** — until the panel gets TLS for another reason.

5. **Keep the current approach** — serve as is. Cons: 1193 KB on the first visit over the local network and fifty re-requested dictionaries. **Rejected.**

## Decision outcome

The panel build compresses. The `metabox-compress` plugin puts two variants next to each compressible file in `dist`: `.br` (brotli, maximum quality) and `.gz` (gzip -9). `.js`, `.css`, `.html`, `.json`, `.svg` are compressed; a file under 256 bytes and a variant that saved less than a tenth are not written. `woff2` is not compressed — it is already compressed.

Both formats, not only brotli: the panel lives on plain http, and the browser does not announce `br` on every connection.

The daemon picks a variant by `Accept-Encoding`, sets `Content-Encoding` and `Vary: Accept-Encoding`. Serving rules:

- the content type is taken from the original name: by the `.br` extension it would be detected as a byte stream;
- a token with zero weight (`br;q=0`) counts as a refusal, not a choice;
- if there is no variant or the client does not accept it, the original file is sent;
- a `.br` or `.gz` itself is not an address: a direct request gets the shell, otherwise the client would see undecompressed bytes.

The permanent cache stays tied to the fingerprint in the name — the rule does not change, and localization dictionaries now fall under it too.

### Scope and boundaries

`apps/web/vite.config.ts` (the `metabox-compress` plugin) and `apps/metaboxd/internal/webui`. The daemon API, the runtime stream and the Clash API proxy are not affected.

## Consequences

### Positive

- The first visit is 298 KB instead of 1193 KB, 75% less over the network. Main chunk: 307 KB → 84 KB (brotli) or 96 KB (gzip).
- The daemon's CPU time per request did not change: it serves a file, just a smaller one.
- Localization dictionaries fell under the permanent cache together with the other assets.

### Negative

- The static directory grew from 1.6 to 2.0 MB, and the binary by the same amount: it holds second copies of files.
- The panel build takes 4.9 s instead of ~1 s: maximum-quality brotli is slow.
- Serving is no longer one `http.FileServerFS` call: `Accept-Encoding` parsing and custom response writing appeared. This is covered by tests, but it is code that did not exist.
- `Range` on a compressed response addresses compressed bytes. nginx `gzip_static` behaves the same; the panel's static assets have no such scenario.

### Neutral or deferred

- HTTP/2 is not enabled while the panel has no TLS. Once TLS appears, Go brings up h2 via ALPN by itself, with no separate decision needed.
- Compression of API responses is not introduced: they are small and go one at a time.

## Compatibility, migration and rollback

No migration: variants appear in `dist` on the next build, and a client that does not accept them gets the same as before. Old clients are not affected — negotiation goes by a header browsers always send.

Rollback: remove the plugin from the build: the daemon, finding no variants, falls back to serving original files with no changes to the daemon itself.

## Validation

- `cd apps/metaboxd && go test ./internal/webui/` — variant choice by `Accept-Encoding`, including `br;q=0`; content type from the original name; permanent cache on a fingerprinted dictionary; `.br` is not served as an address;
- `make daemon` and `curl -H 'Accept-Encoding: br'` against the built binary — the `Content-Encoding`, `Content-Type`, `Vary`, `Cache-Control` headers and response size;
- comparing first-visit sizes with `Accept-Encoding: identity` and `br` on the same set of files.

## Links

- [NFR-4](../PRD.md) — the daemon's resource budget;
- [ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md) — the SPA is embedded in the binary;
- [ADR-0011](./ADR-0011-ship-the-daemon-as-an-apk-package.md) — the daemon is installed as an apk package;
- [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md) — localization dictionaries as static assets;
- [Daemon HTTP layer](../../apps/metaboxd/docs/guides/HTTPAPI.md) — section "Serving the SPA";
- [`apps/metaboxd/internal/webui/webui.go`](../../apps/metaboxd/internal/webui/webui.go).
