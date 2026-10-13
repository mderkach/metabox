# State management

Zustand. There is no immer draft in the middleware set: none of the stores holds a tree, and on a stream snapshot the wrappers ate almost the whole handler budget ([ADR-0024](../../../../docs/adr/ADR-0024-drop-the-immer-draft-from-frontend-stores.md)).

## Area of responsibility

A store is responsible for:

1. replacing multiple `useState` calls;
2. replacing React Context where it is used as a data transport;
3. passing state between components and screens;
4. computed properties on top of data already received;
5. state that would be expensive to keep in React Hook Form (see [Forms](./Form&Validation.md)).

**A store does not manage HTTP requests.** Request-response is the area of TanStack Query. The exception: topics of the runtime SSE stream bypass Query and go into a separate store, because a cache on top of a stream lies.

## The application's three stores

| Store role     | Where it lives                       | What it holds                                                   |
| -------------- | ------------------------------------ | --------------------------------------------------------------- |
| document       | `model` of the edited entity's slice | the text from the device, the draft, the update counter         |
| runtime stream | `model` of the stream entity's slice | topic frames of `GET /api/events`                               |
| local          | in place                             | the state of a single widget that there is no reason to lift up |

Do not create more global stores. If two components of one slice need a state, it is a local store of the slice, not a global one.

## Tools

`shared/lib/state` contains three wrappers:

- `stateCreator`: the store factory; it plugs in `devtools`;
- `useStore`: a subscription with `useShallow`, so that a multiple selection does not cause extra renders;
- `createReactSelectors`: generates `State.use.<prop>()` from the store keys.

### Creation

```ts
import { stateCreator, createReactSelectors } from '@shared/lib/state';

interface DocumentState {
  applied: string | null;
  draft: string | null;
  edit: (path: JSONPath, value: unknown) => void;
}

const DocumentStateProto = stateCreator<DocumentState>(
  (set) => ({
    applied: null,
    draft: null,
    edit: (path, value) => {
      set((state) => {
        const text = state.draft ?? state.applied;

        return text === null ? state : { draft: setValue(text, path, value) };
      });
    },
  }),
  'ConfigDocument'
);

export const DocumentState = createReactSelectors(DocumentStateProto);
```

Naming is the same as for components. A store with the `Proto` suffix is module-private; the result of `createReactSelectors` is exported, and the same `Proto` is exported under its own name as the `*Store` alias for access outside React.

A handler returns the changed fields, it does not mutate the state. An empty `return` is not allowed: zustand takes it for the new state. "Change nothing" is `return state`: the reference comparison passes and subscribers are not touched; `{}` instead would give a new state object and a pass over the whole subscriber list. A ring buffer is updated with a new array, `[...buffer, next].slice(-LIMIT)`, not with a `push` and `shift` pair.

### Subscription

A single value goes through the generated selector; this is the preferred option:

```tsx
function DraftBadge() {
  const draft = DocumentState.use.draft();

  return draft === null ? null : <Badge>draft</Badge>;
}
```

A computed value is returned by a hook next to the store: the generated selector would return the function itself, not the result, and the subscription would not work.

```ts
export function useConfigDirty(): boolean {
  return useStore(ConfigDocumentStateProto, (state) => state.isDirty());
}
```

Several values go through `useStore`, which memoizes the selection with `shallow`:

```tsx
function ApplyBar() {
  const { applied, draft } = useStore(DocumentStateProto, (state) => ({
    applied: state.applied,
    draft: state.draft,
  }));

  return <div>...</div>;
}
```

### Outside React

Direct access to the state goes through `getState()` / `setState()` on the `*Store` alias (`ConnectionStore`, `DaemonStore`): `*Proto` itself does not leave its module. This is how, for example, the runtime stream topic handlers that live outside the component tree work.

## Config document

The document is stored as **the file text**, not as a parsed tree: an edit is applied to the original bytes, otherwise the user's key order is rewritten entirely. Parsing with the schema lives in the `api` segment and is needed for display and validation, not for saving.

The store holds the text from the device, the draft and the counter of updates that did not come from the user. Rules:

- Nodes are addressed with `JSONPath` from `jsonc-parser`: an array of segments (`['outbounds', 2, 'uuid']`). Writes go through `setValue`, `removeValue` and `insertValue` from the `model` of the `Config` slice; they return a new text, which becomes the Apply body.
- **The draft does not add fields.** Default values are not written, a cleared field is removed from the node. Otherwise the diff before apply would show edits the user did not make.
- Unrecognized nodes do not go through serialization at all: the text stays text, there is nothing to distort.
- Whether there are edits and the diff between the applied text and the draft are computed by selectors, not stored in separate fields.
- Version history comes from the server through Query and does not get into the store at all: the history dialog reads it with a query and rolls back through the Apply protocol.
- There is no step-by-step undo: `discard` drops the whole draft. A stack of previous texts could be added, but there is none, and tree patches would not fit it: there is no tree in the store, and for the same reason the immer draft was removed from the middleware set.

## Runtime stream

The stream store receives topic frames of `GET /api/events`. The budget is thousands of objects in the stream, without blocking the main thread for longer than 100 ms:

- Large frames (the connections snapshot) are applied in a batch on a timer, not on every message. A sample of two numbers needs no batch.
- A fixed-length ring buffer is kept; objects that drop out leave it. History deeper than the tab's buffer is accumulated by the daemon and returned by `GET /api/history`: the store does not accumulate it.
- Stream objects are indexed by id in a `Map`, a component gets a slice for a virtualized list, not the whole buffer.
- Aggregation happens on the server; the store holds only what is drawn. The current exception is the connections snapshot summary: it is computed in the same pass that parses the snapshot and is kept under a budget measurement. New exceptions are not added without the same measurement.

## Forbidden

**Subscribing to the whole store.** Any change causes a render:

```tsx
const state = useStore(DocumentStateProto, (s) => s); // ❌
```

**Calling a computing action instead of a selector.** The subscription does not work, there is no rerender:

```tsx
// ❌ no rerender
const calc = useStore(StateProto, (state) => state.calcTotal);
const total = calc();

// ✅
const total = useStore(StateProto, (state) => state.calcTotal());
```

**Excessive multiple selectors.** If a component selects eight fields, it most likely needs to be split.

## Useful zustand recipes

1. [No-action stores](https://zustand.docs.pmnd.rs/guides/practice-with-no-store-actions): for writes from handlers outside React, see the "Outside React" section
2. [Store slices](https://zustand.docs.pmnd.rs/guides/slices-pattern): for the config document, so that the draft, history and dirty tracking are separate files
3. [Map and Set](https://zustand.docs.pmnd.rs/guides/maps-and-sets-usage): for the connection index by id
4. [Resetting state](https://zustand.docs.pmnd.rs/guides/how-to-reset-state): on device change or config reload
