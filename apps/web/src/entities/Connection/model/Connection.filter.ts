import { z } from 'zod';

import { matchesWords, toQueryWords } from '@shared/lib/search';

import { ROUTE_KIND, type ConnectionRow, type RouteKind } from './Connection.model';

/** Which set of connections is shown: live or already closed. */
export const CONNECTION_TAB = {
  Active: 'active',
  Closed: 'closed',
} as const;

export type ConnectionTab = (typeof CONNECTION_TAB)[keyof typeof CONNECTION_TAB];

/**
 * A facet is a slice of the list by one row field. The order of entries is the
 * order of toolbar buttons: from "whose is it" and "where did it go" to route
 * details.
 */
export const CONNECTION_FACET = {
  Source: 'source',
  Kind: 'kind',
  Rule: 'rule',
  Chain: 'chain',
  Network: 'network',
} as const;

export type ConnectionFacet = (typeof CONNECTION_FACET)[keyof typeof CONNECTION_FACET];

export const CONNECTION_FACETS: readonly ConnectionFacet[] = Object.values(CONNECTION_FACET);

/** Selected values of each facet; an empty list means the facet selects nothing. */
export type ConnectionFacetSelection = Readonly<Record<ConnectionFacet, readonly string[]>>;

function toFacetRecord<T>(make: (facet: ConnectionFacet) => T): Record<ConnectionFacet, T> {
  return {
    [CONNECTION_FACET.Source]: make(CONNECTION_FACET.Source),
    [CONNECTION_FACET.Kind]: make(CONNECTION_FACET.Kind),
    [CONNECTION_FACET.Rule]: make(CONNECTION_FACET.Rule),
    [CONNECTION_FACET.Chain]: make(CONNECTION_FACET.Chain),
    [CONNECTION_FACET.Network]: make(CONNECTION_FACET.Network),
  };
}

export const EMPTY_FACET_SELECTION: ConnectionFacetSelection = toFacetRecord(() => []);

const ROUTE_KINDS = Object.values(ROUTE_KIND);

/**
 * A facet value in the URL: one as a string, several as a list. Old links
 * `?source=<ip>&kind=proxy` also stay as a string: the devices screen leads to
 * them.
 */
const FacetParamSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const KindParamSchema = z.union([z.enum(ROUTE_KINDS), z.array(z.enum(ROUTE_KINDS)).min(1)]);
/**
 * An empty string is a rule without conditions, and it is a real facet value.
 * In the URL the rule facet is called `match`: `rule` is taken by the rule
 * number of the routing screen, and `useSearch({ strict: false })` shared by
 * routes would get two types for one key.
 */
const RuleParamSchema = z.union([z.string(), z.array(z.string()).min(1)]);

/**
 * Selection in the URL: a link to a filtered list is what people share when
 * asking "why does traffic go here". Default values are not written to the URL,
 * so a clean list opens with a clean address.
 */
export const ConnectionSearchSchema = z.object({
  tab: z.enum([CONNECTION_TAB.Active, CONNECTION_TAB.Closed]).optional(),
  q: z.string().min(1).optional(),
  source: FacetParamSchema.optional(),
  kind: KindParamSchema.optional(),
  match: RuleParamSchema.optional(),
  chain: FacetParamSchema.optional(),
  network: FacetParamSchema.optional(),
});

export type ConnectionSearch = z.infer<typeof ConnectionSearchSchema>;

export type ConnectionFacetSearch = Pick<ConnectionSearch, 'source' | 'kind' | 'match' | 'chain' | 'network'>;

/** A value that is not understood is dropped entirely: half a selection is worse than none. */
export function parseConnectionSearch(search: Record<string, unknown>): ConnectionSearch {
  const parsed = ConnectionSearchSchema.safeParse(search);

  return parsed.success ? parsed.data : {};
}

function toValues(param: string | readonly string[] | undefined): readonly string[] {
  if (param === undefined) {
    return [];
  }

  return typeof param === 'string' ? [param] : param;
}

/** Facet selection from the URL. */
export function toFacetSelection(search: ConnectionFacetSearch): ConnectionFacetSelection {
  return {
    [CONNECTION_FACET.Source]: toValues(search.source),
    [CONNECTION_FACET.Kind]: toValues(search.kind),
    [CONNECTION_FACET.Rule]: toValues(search.match),
    [CONNECTION_FACET.Chain]: toValues(search.chain),
    [CONNECTION_FACET.Network]: toValues(search.network),
  };
}

function toParam<T extends string>(values: readonly T[]): T | T[] | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values.length === 1 ? values[0] : [...values];
}

const ROUTE_KIND_SET = new Set<string>(ROUTE_KINDS);

function isRouteKind(value: string): value is RouteKind {
  return ROUTE_KIND_SET.has(value);
}

/**
 * Facet selection for the URL. One value is written as a string: a link to one
 * device stays short, `?source=<ip>`, and can be typed by hand.
 */
export function toFacetSearch(selection: ConnectionFacetSelection): ConnectionFacetSearch {
  return {
    source: toParam(selection.source),
    kind: toParam(selection.kind.filter(isRouteKind)),
    match: toParam(selection.rule),
    chain: toParam(selection.chain),
    network: toParam(selection.network),
  };
}

export function hasFacetSelection(selection: ConnectionFacetSelection): boolean {
  return CONNECTION_FACETS.some((facet) => selection[facet].length > 0);
}

/** Facet value and the number of rows under it. */
export interface ConnectionFacetValue {
  value: string;
  count: number;
}

export type ConnectionFacetValues = Readonly<Record<ConnectionFacet, readonly ConnectionFacetValue[]>>;

const KIND_RANK = new Map<string, number>(
  [ROUTE_KIND.Proxy, ROUTE_KIND.Direct, ROUTE_KIND.Block, ROUTE_KIND.Dns, ROUTE_KIND.Other].map((kind, rank) => [
    kind,
    rank,
  ])
);

/** Row field values by which a facet selects it. Every chain node counts: the group and the node behind it. */
const FACET_FIELD: Readonly<Record<ConnectionFacet, (row: ConnectionRow) => string | readonly string[]>> = {
  [CONNECTION_FACET.Source]: (row) => row.source,
  [CONNECTION_FACET.Kind]: (row) => row.kind,
  [CONNECTION_FACET.Rule]: (row) => row.rule,
  [CONNECTION_FACET.Chain]: (row) => row.chain,
  [CONNECTION_FACET.Network]: (row) => row.network,
};

/** Source label for search. Devices are known to their slice, not to the connection, so the label comes from outside. */
export type ConnectionSourceLabel = (source: string) => string;

export interface ConnectionFilterResult {
  rows: ConnectionRow[];
  facets: ConnectionFacetValues;
}

/** Numeric chunks are compared as numbers: 192.168.1.36 goes before 192.168.1.120. */
const NATURAL_ORDER = new Intl.Collator(undefined, { numeric: true });

/**
 * Facet values in an order that does not depend on counters: they change every
 * second, and values would shuffle under the cursor. Actions follow a fixed
 * list, devices go by label, the rest by value.
 */
function toFacetValues(
  counts: Map<string, number>,
  facet: ConnectionFacet,
  sourceLabel: ConnectionSourceLabel | null
): ConnectionFacetValue[] {
  const values = [...counts].map(([value, count]) => ({ value, count }));

  if (facet === CONNECTION_FACET.Kind) {
    return values.sort((left, right) => (KIND_RANK.get(left.value) ?? 0) - (KIND_RANK.get(right.value) ?? 0));
  }

  if (facet === CONNECTION_FACET.Source && sourceLabel !== null) {
    return values.sort(
      (left, right) =>
        sourceTier(left.value, sourceLabel) - sourceTier(right.value, sourceLabel) ||
        NATURAL_ORDER.compare(sourceLabel(left.value), sourceLabel(right.value))
    );
  }

  return values.sort((left, right) => NATURAL_ORDER.compare(left.value, right.value));
}

const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const SOURCE_TIER = { Named: 0, Local: 1, Foreign: 2 } as const;

/**
 * Named devices go first, then unnamed local network addresses, and foreign
 * addresses are last: their connections came from outside, and they have to be
 * looked up in the device list least often.
 */
function sourceTier(source: string, sourceLabel: ConnectionSourceLabel): number {
  if (sourceLabel(source) !== source) {
    return SOURCE_TIER.Named;
  }

  return PRIVATE_IPV4.test(source) ? SOURCE_TIER.Local : SOURCE_TIER.Foreign;
}

/**
 * Connection selection and facet counters in one pass.
 *
 * Facet values are everything present in the tab plus the selected ones, even
 * if there are no rows under them now: a facet does not lose a value because of
 * its own selection or a neighbor's. A value counter is computed with search
 * and the other facets but without its own: it answers how many rows selecting
 * the value will add, not how many are in the tab at all. A row that fails
 * exactly one facet is therefore counted only in it.
 *
 * Within a facet values combine with "or", and facets with each other with
 * "and".
 *
 * `sourceLabel` extends the search index with the device label: a connection is
 * found by name although the search string holds an address. The label is
 * computed once per source, not per row: devices are a handful, rows are
 * thousands. It also orders the devices in the facet.
 */
export function filterConnections(
  rows: ConnectionRow[],
  query: string,
  selection: ConnectionFacetSelection = EMPTY_FACET_SELECTION,
  sourceLabel: ConnectionSourceLabel | null = null
): ConnectionFilterResult {
  const words = toQueryWords(query);
  const labels = new Map<string, string>();

  function labelText(value: string): string {
    let text = labels.get(value);

    if (text === undefined) {
      text = sourceLabel === null ? '' : sourceLabel(value).toLowerCase();
      labels.set(value, text);
    }

    return text;
  }

  function matchesQuery(row: ConnectionRow): boolean {
    return (
      matchesWords(row.searchText, words) ||
      (sourceLabel !== null &&
        words.every((word) => row.searchText.includes(word) || labelText(row.source).includes(word)))
    );
  }

  const active = CONNECTION_FACETS.filter((facet) => selection[facet].length > 0).map((facet) => ({
    facet,
    selected: new Set(selection[facet]),
  }));
  const counts = toFacetRecord(() => new Map<string, number>());
  const shown: ConnectionRow[] = [];

  function addValues(facet: ConnectionFacet, row: ConnectionRow, step: number) {
    const facetCounts = counts[facet];
    const field = FACET_FIELD[facet](row);

    if (typeof field === 'string') {
      facetCounts.set(field, (facetCounts.get(field) ?? 0) + step);

      return;
    }

    for (const value of field) {
      facetCounts.set(value, (facetCounts.get(value) ?? 0) + step);
    }
  }

  for (const row of rows) {
    let failed: ConnectionFacet | null = null;
    let failures = 0;

    for (const { facet, selected } of active) {
      const field = FACET_FIELD[facet](row);
      const matched = typeof field === 'string' ? selected.has(field) : field.some((value) => selected.has(value));

      if (!matched) {
        failures += 1;
        failed = facet;
      }
    }

    const counted = failures <= 1 && matchesQuery(row);

    for (const facet of CONNECTION_FACETS) {
      addValues(facet, row, counted && (failures === 0 || facet === failed) ? 1 : 0);
    }

    if (counted && failures === 0) {
      shown.push(row);
    }
  }

  for (const { facet, selected } of active) {
    for (const value of selected) {
      if (!counts[facet].has(value)) {
        counts[facet].set(value, 0);
      }
    }
  }

  return { rows: shown, facets: toFacetRecord((facet) => toFacetValues(counts[facet], facet, sourceLabel)) };
}
