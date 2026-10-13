# metabox Go guides

The frontend guides live separately: [`apps/web/docs/`](../../../../apps/web/docs/README.md).

| Document                                                | Topic                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Architecture and style guide](./Architecture&Style.md) | Two modules, daemon boundaries, package layout, dependencies, style, tools                   |
| [Errors and logging](./ErrorsAndLogging.md)             | Wrapping, sentinel and typed errors, HTTP boundaries, `log/slog`, what never goes into logs  |
| [Daemon HTTP layer](./HTTPAPI.md)                       | `net/http`: routing, handlers, middleware, origin check, timeouts, shutdown, serving the SPA |
| [Files, processes, service](./DeviceIO.md)              | Atomic writes, paths, calling `sing-box`, procd, Apply transaction state, resource budget    |
| [Testing](./Testing.md)                                 | `testing` without assertion libraries, tables, `synctest`, golden files, integration tests   |
| [Code review checklist](./ReviewChecklist.md)           | Consolidated checklist to go through before handing in a change                              |

Which document to read when: the "When to read the guides" table in [`apps/metaboxd/AGENTS.md`](../../AGENTS.md). The priority order for conflicts is one for the whole repository, see "Rule sources and their priority" in the root [`AGENTS.md`](../../../../AGENTS.md).
