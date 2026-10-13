import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Middleware set shared by all application stores: `devtools` — so that the apply
 * steps are visible in the extension.
 *
 * The immer draft is removed from the set: editing a config node goes by text, not by
 * tree, and no store mutates nested nodes. Instead, each stream snapshot
 * was wrapped in a proxy — on five thousand connections this
 * ate almost all of the handler time ([ADR-0024](../../../../../../docs/adr/ADR-0024-drop-the-immer-draft-from-frontend-stores.md)).
 */
type Middlewares = [['zustand/devtools', never]];

/**
 * Store factory. Assembled here, not on the spot, so the middleware set does not
 * drift between stores: `devtools` without a name merges them into one stream.
 *
 * `name` is visible in Redux DevTools and must match the store's role
 * (`ConfigDocument`, `ConnectionStream`).
 */
export function stateCreator<T extends object>(initializer: StateCreator<T, Middlewares>, name: string) {
  return create<T>()(devtools(initializer, { name, enabled: import.meta.env.DEV }));
}
