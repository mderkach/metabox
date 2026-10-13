# ADR-0010. Merge the runtime into one SSE stream from the daemon instead of proxying three sources to the browser

- Status: Accepted
- Date: 2026-09-11
- Deciders: repository owner

## Context and problem statement

[ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md) requires connections and the runtime state to reach the frontend in a shape that does not depend on the source: the daemon reduces the sources to one model and reports the active one in `GET /api/status`. The implementation went differently: a pass-through proxy `/api/clash/*` together with an upgrade to WebSocket. The panel started working the same day, but it talks in Clash API shapes directly.

What this costs in practice:

- the panel holds three WebSockets, `/traffic`, `/memory`, `/connections`, and reconnection is implemented in three places;
- the data shape on the frontend is tied to the Clash API, so a second source would break it;
- every open tab sets up its own set of subscriptions to sing-box.

The constraints were set earlier. The daemon's `go.mod` stays without a single `require`, and the standard library has no WebSocket server, so a dependency for it would be a separate decision. There must be no background timer polling without a consumer on the device ([DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md)): the router is idle most of the time.

A useful property of the fork came up when checking the sources: `/traffic` and `/memory` return data without WebSocket too. On a regular GET the handler writes one line of JSON per second into a chunked response; it does not need an upgrade. `/connections` without an upgrade returns a one-time snapshot.

In scope: the runtime transport from the daemon to the panel and who holds the subscriptions to the sources. Out of scope: the choice between the Clash API and gRPC, which stays with ADR-0006; moving the panel screens to the new stream.

## Decision drivers

1. **Shape independent of the source**: the ADR-0006 requirement, which is the whole point.
2. **Zero new dependencies**: the daemon's `go.mod` without `require`.
3. **One place for reconnection and state rebuild** instead of three.
4. **The load on sing-box does not grow with the number of tabs.**
5. **No polling without a consumer** (DeviceIO).

## Considered options

1. **Keep the pass-through proxy.** Pros: it works, zero code. Cons: it does not satisfy ADR-0006 (driver 1); three reconnection points (driver 3); every tab has its own set of subscriptions (driver 4). **Rejected.**

2. **WebSocket from the daemon to the panel.** Pros: a two-way channel, the panel already knows how to work with it. Cons: the standard library has no WebSocket server, so it means a dependency in a module that has none (driver 2) and a separate decision for it. Two-way communication is not needed anyway: everything the panel sends is regular requests, and there is one subscription for all topics. **Rejected.**

3. **Timer polling by the panel.** Pros: as simple as it gets, no streams. Cons: polling four endpoints every second from every tab is exactly the load we are moving away from (driver 4); screen liveness drops. **Rejected.**

4. **One SSE stream from the daemon.** Pros: a regular HTTP response from the standard library (driver 2); one point of subscription and reconnection (driver 3); the daemon holds one set of upstreams for all readers (driver 4); the envelope shape belongs to the daemon (driver 1). Cons: the stream is one-way, and a single topic cannot be unsubscribed: the panel gets all of them. **Chosen.**

## Decision outcome

**Endpoint.** `GET /api/events` returns `text/event-stream`. The envelope is `{topic, seq, data}`, the topics are `traffic`, `memory`, `connections`, `service`. A two-way channel is not needed: everything the panel changes, it changes with regular requests.

**Counter.** `seq` runs across all topics and grows monotonically. From a gap in the numbers the panel sees that it missed events and re-requests the state. Time is not put into the envelope: the router has no real-time clock.

**One set of upstreams for everyone.** The daemon holds subscriptions to the sources while there is at least one reader, and delivers events to all of them at once. A second reader does not double the load on sing-box. When the last reader leaves, polling stops: no background work without a consumer remains.

**Upstreams without WebSocket.** `/traffic` and `/memory` are read with a regular GET as a line-by-line chunked response, `/connections` as a snapshot by timer, and the service state by less frequent polling, because it means launching external processes. The daemon has no WebSocket client.

**A newly connected reader gets the state immediately.** The daemon remembers the last event of each topic and replays them to a new reader. Otherwise the screen after a page reload would stay empty until the next polling period.

**A slow reader loses events instead of accumulating them.** A subscriber's queue is bounded; when it is full, the event for that subscriber is dropped. An unbounded queue in a daemon that runs for months is more dangerous than a missed sample, and the panel sees the miss from the `seq` gap.

**The service state in the stream and in the endpoint is the same body.** The response shape is built by one function, so the panel gets the same data whether it came from the stream or from a request.

**The buffer is flushed through `http.NewResponseController`.** A cast to `http.Flusher` does not work: middleware wraps `ResponseWriter` in its own type that lacks the method; the wrapper exposes the original writer through `Unwrap`, which the controller follows. Support is checked by walking `Unwrap` before the first write: an attempt to flush would itself send the header, and after that there would be no way to refuse.

**The pass-through proxy stays.** Request-response endpoints (rules, groups, the DNS query) keep going through `/api/clash/*`: there is no reason to wrap them into the stream. The stream proxy stays until the panel moves to `/api/events`; this is a transitional state, not a second permanent path.

### Scope and boundaries

The decision covers `internal/events` and the contract between the daemon and the panel. The choice of source (Clash API or gRPC) stays with ADR-0006: the stream hides it from the panel, it does not replace it.

## Consequences

### Positive

- The ADR-0006 requirement of a shape independent of the source holds: the panel sees the daemon's envelope, not the Clash API shape.
- Reconnection and state rebuild live in one place instead of three.
- The number of tabs does not increase the load on sing-box.
- No dependencies were added: SSE is a regular HTTP response.

### Negative

- The stream is one-way, and the subscription covers all topics at once. A panel that needs only traffic still gets connections. With the current set of topics this is cheaper than a subscription protocol on top of the stream.
- Until the panel is moved over, the daemon has two paths to the runtime: the stream and the stream proxy. This is transitional debt, and it must be closed together with moving the screens.
- Connections still go as snapshots: only gRPC has deltas, and its implementation is deferred until a measurement (ADR-0006).

### Neutral or deferred

- Moving the panel screens to `/api/events` and removing the stream proxy is a separate task.
- Unsubscribing from individual topics is not done: if needed, it is added as a request parameter, and the envelope does not have to change.

## Risks and mitigations

| Risk                                            | Likelihood and impact | Mitigation                                                                                                                              |
| ----------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| An intermediate proxy buffers the stream        | Low, medium impact    | `Cache-Control: no-store` and `X-Accel-Buffering: no`; the daemon serves the panel itself, and the standard setup has no intermediaries |
| Polling goroutines outlive the readers          | Low, high impact      | Stopping waits for all goroutines to finish; covered by a test on stopping after the last reader                                        |
| A slow reader slows down delivery to the others | Medium, medium impact | Sending is non-blocking, a full queue loses the event; the `seq` gap is visible to the panel                                            |
| An upstream drop leaves the stream silent       | Medium, medium impact | Reading the source restarts after a pause; a drop is normal, sing-box gets restarted                                                    |

## Compatibility, migration and rollback

Existing screens keep working through the proxy: the endpoint is added and nothing is removed. Moving the panel over happens separately and gradually.

Rollback: remove `/api/events` and the stream package. The panel stays on the pass-through proxy `/api/clash/*`.

## Validation

- `GET /api/events` on the device returns `text/event-stream`, and in the first seconds events of all four topics arrive with a growing `seq`.
- A second open tab does not increase the number of the daemon's subscriptions to sing-box.
- Closing the last reader stops polling the sources: no new requests go to the Clash API.
- A daemon started without a single reader does not poll the stream sources: calls to the Clash API happen only on panel requests.
- The service state in the stream matches the `GET /api/service` response.

## Links

- [ADR-0006](./ADR-0006-read-runtime-from-clash-api-and-optional-grpc.md): runtime sources and the shape requirement;
- [ADR-0009](./ADR-0009-read-service-state-from-procd.md): the service state that goes into the `service` topic;
- [PRD](../PRD.md): AC-10…AC-12, AC-30, NFR-1, NFR-2;
- [DeviceIO](../../apps/metaboxd/docs/guides/DeviceIO.md): the ban on background polling without a consumer;
- [HTTPAPI](../../apps/metaboxd/docs/guides/HTTPAPI.md): why `WriteTimeout` is not set globally.
