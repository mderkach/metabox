# metabox frontend documentation

| Document                                                       | Topic                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Architecture and style guide](./guides/Architecture&Style.md) | FSD structure of `apps/web/src`, Public API, naming, components, styles, tools                                 |
| [State management](./guides/StateManagement.md)                | Zustand: area of responsibility, `stateCreator`, selectors, prohibitions                                       |
| [Working with requests](./guides/Query.md)                     | TanStack Query: fetch functions, key and option factories, `meta`, invalidation, runtime stream past the cache |
| [Forms and validation](./guides/Form&Validation.md)            | React Hook Form + Zod, field path constraints, adapter schemas, generated schemas                              |
| [Lists and tables](./guides/Tables.md)                         | Table engine, list anatomy, virtualization, sorting, filters, density, states                                  |
| [Testing](./guides/UnitTesting.md)                             | Vitest + Testing Library, mocks, golden round trip, coverage                                                   |
| [Code review checklist](./guides/ReviewChecklist.md)           | Consolidated checklist of the rules                                                                            |

Which document to read when: the "When to read the guides" table in [`apps/web/AGENTS.md`](../AGENTS.md). The priority order for conflicts is one for the whole repository, see "Rule sources and their priority" in the root [`AGENTS.md`](../../../AGENTS.md).
