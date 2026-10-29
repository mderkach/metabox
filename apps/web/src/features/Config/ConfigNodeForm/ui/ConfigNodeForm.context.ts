import { createContext } from 'react';

import type { NodeRegistry } from '@entities/Config';

/** Type of the error set by a raw field with unparsed JSON. */
export const RAW_PARSE_ERROR = 'parse';

/**
 * Raw fields with unparsed JSON: field name to the form value at which the text
 * did not parse. Such a field keeps its previous value, and the resolver will
 * pass it, so this table stops the write. An entry goes stale when the field
 * value changed from outside: the field text is then rewritten with the new
 * value. There is one table per form and it does not change: the context over
 * the form does not redraw it.
 */
export const RawFailuresContext = createContext<Map<string, unknown>>(new Map());

/** Registry of the node the form edits; `null` for a field outside a node form. */
export const NodeRegistryContext = createContext<NodeRegistry | null>(null);
