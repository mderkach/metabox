import { describe, expect, it } from 'vitest';

import {
  CONNECTION_FACET,
  EMPTY_FACET_SELECTION,
  filterConnections,
  parseConnectionSearch,
  toFacetSearch,
  toFacetSelection,
  type ConnectionFacetSelection,
} from '../model/Connection.filter';
import { ROUTE_KIND, type ConnectionRow } from '../model/Connection.model';

function makeRow(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: 'c1',
    host: 'api.anthropic.example:443',
    network: 'tcp',
    source: '192.168.1.60',
    rule: 'rule_set=anthropic',
    action: 'route(us-west-fallback)',
    kind: ROUTE_KIND.Proxy,
    chain: ['us-west-fallback', 'us-west', 'sub-us/USA'],
    upload: 0,
    download: 0,
    downRate: 0,
    upRate: 0,
    startedAt: 0,
    searchText: '',
    ...overrides,
  };
}

/** The search field is built by the adapter; the fixture builds it from the same fields. */
function withSearchText(row: ConnectionRow): ConnectionRow {
  return {
    ...row,
    searchText: [row.host, row.source, row.network, row.rule, row.action, ...row.chain].join(' ').toLowerCase(),
  };
}

function makeSearchableRow(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return withSearchText(makeRow(overrides));
}

function ids(rows: ConnectionRow[]): string[] {
  return rows.map((row) => row.id);
}

function select(patch: Partial<ConnectionFacetSelection>): ConnectionFacetSelection {
  return { ...EMPTY_FACET_SELECTION, ...patch };
}

function search(rows: ConnectionRow[], query: string, sourceLabel?: (ip: string) => string): ConnectionRow[] {
  return filterConnections(rows, query, EMPTY_FACET_SELECTION, sourceLabel).rows;
}

describe('connection search', () => {
  const rows = [makeSearchableRow()];

  it('an empty query lets everything through', () => {
    expect(search(rows, '   ')).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    expect(search(rows, 'ANTHROPIC')).toHaveLength(1);
  });

  it('requires all words to match, not any', () => {
    expect(search(rows, 'anthropic us-west')).toHaveLength(1);
    expect(search(rows, 'anthropic telegram')).toHaveLength(0);
  });

  it('also searches chain nodes', () => {
    expect(search(rows, 'sub-us')).toHaveLength(1);
  });

  it('searches by source and protocol', () => {
    expect(search([makeSearchableRow({ network: 'udp' })], '192.168.1.60 udp')).toHaveLength(1);
  });
});

describe('search by device label', () => {
  const rows = [makeSearchableRow(), makeSearchableRow({ id: 'c2', source: '192.168.1.36' })];
  const LABELS = new Map([['192.168.1.60', 'Ноутбук гостя']]);

  function sourceLabel(ip: string): string {
    return LABELS.get(ip) ?? ip;
  }

  it('finds a connection by device name although the search string holds an address', () => {
    expect(ids(search(rows, 'ноутбук', sourceLabel))).toEqual(['c1']);
  });

  it('query words may be split between the label and the other fields', () => {
    expect(search(rows, 'гостя anthropic', sourceLabel)).toHaveLength(1);
    expect(search(rows, 'гостя telegram', sourceLabel)).toHaveLength(0);
  });

  it('without a label searches only by address', () => {
    expect(search(rows, 'ноутбук')).toHaveLength(0);
    expect(ids(search(rows, '192.168.1.36', sourceLabel))).toEqual(['c2']);
  });
});

describe('facet filtering', () => {
  const rows = [
    makeSearchableRow({ id: '1', source: '192.168.1.60', host: 'claude.example:443' }),
    makeSearchableRow({
      id: '2',
      source: '192.168.1.65',
      host: 'telegram.example:443',
      rule: '',
      kind: ROUTE_KIND.Direct,
      chain: ['direct'],
      network: 'udp',
    }),
    makeSearchableRow({ id: '3', source: '192.168.1.120', kind: ROUTE_KIND.Block, chain: ['block'] }),
  ];

  it('with no selection and no query returns everything', () => {
    expect(filterConnections(rows, '').rows).toHaveLength(3);
  });

  it('within a facet combines values with "or"', () => {
    const { rows: shown } = filterConnections(rows, '', select({ source: ['192.168.1.60', '192.168.1.65'] }));

    expect(ids(shown)).toEqual(['1', '2']);
  });

  it('between facets combines with "and", and with the query too', () => {
    expect(filterConnections(rows, '', select({ source: ['192.168.1.60'], kind: [ROUTE_KIND.Direct] })).rows).toEqual(
      []
    );
    expect(ids(filterConnections(rows, 'telegram', select({ kind: [ROUTE_KIND.Direct] })).rows)).toEqual(['2']);
    expect(filterConnections(rows, 'claude', select({ kind: [ROUTE_KIND.Direct] })).rows).toEqual([]);
  });

  it('filters by any chain node: both the group and the node behind it', () => {
    expect(ids(filterConnections(rows, '', select({ chain: ['sub-us/USA'] })).rows)).toEqual(['1']);
    expect(ids(filterConnections(rows, '', select({ chain: ['us-west-fallback', 'block'] })).rows)).toEqual(['1', '3']);
  });

  it('a rule without conditions is a separate facet value', () => {
    expect(ids(filterConnections(rows, '', select({ rule: [''] })).rows)).toEqual(['2']);
  });

  it('filters by network', () => {
    expect(ids(filterConnections(rows, '', select({ network: ['udp'] })).rows)).toEqual(['2']);
  });
});

describe('facet values and counters', () => {
  const rows = [
    makeSearchableRow({ id: '1', source: '192.168.1.60', kind: ROUTE_KIND.Proxy }),
    makeSearchableRow({ id: '2', source: '192.168.1.60', kind: ROUTE_KIND.Direct }),
    makeSearchableRow({ id: '3', source: '192.168.1.120', kind: ROUTE_KIND.Direct }),
    makeSearchableRow({ id: '4', source: '192.168.1.36', kind: ROUTE_KIND.Block }),
  ];

  it('without filtering counts the rows of each value across the whole tab', () => {
    const { facets } = filterConnections(rows, '');

    expect(facets.kind).toEqual([
      { value: ROUTE_KIND.Proxy, count: 1 },
      { value: ROUTE_KIND.Direct, count: 2 },
      { value: ROUTE_KIND.Block, count: 1 },
    ]);
  });

  it('keeps the value order, not the order by row count: addresses by the numbers in them', () => {
    const { facets } = filterConnections(rows, '');

    expect(facets.source.map(({ value }) => value)).toEqual(['192.168.1.36', '192.168.1.60', '192.168.1.120']);
  });

  it('devices are ordered by label, not by address', () => {
    const labels = new Map([['192.168.1.120', '0-роутер']]);
    const { facets } = filterConnections(rows, '', EMPTY_FACET_SELECTION, (ip) => labels.get(ip) ?? ip);

    expect(facets.source.map(({ value }) => value)).toEqual(['192.168.1.120', '192.168.1.36', '192.168.1.60']);
  });

  it('first devices with a name, then nameless network addresses, and last foreign addresses', () => {
    const sources = ['198.51.100.7', '192.168.1.101', '192.168.1.60', '10.0.0.5'];
    const mixed = sources.map((source, index) => makeRow({ id: `s${index}`, source }));
    const labels = new Map([['192.168.1.60', 'macbook']]);
    const { facets } = filterConnections(mixed, '', EMPTY_FACET_SELECTION, (ip) => labels.get(ip) ?? ip);

    expect(facets.source.map(({ value }) => value)).toEqual([
      '192.168.1.60',
      '10.0.0.5',
      '192.168.1.101',
      '198.51.100.7',
    ]);
  });

  it('its own selection does not affect the facet counters: the value neither disappears nor drops to zero', () => {
    const { facets } = filterConnections(rows, '', select({ kind: [ROUTE_KIND.Block] }));

    expect(facets.kind).toEqual([
      { value: ROUTE_KIND.Proxy, count: 1 },
      { value: ROUTE_KIND.Direct, count: 2 },
      { value: ROUTE_KIND.Block, count: 1 },
    ]);
  });

  it('a neighboring facet selection narrows the counters and leaves the values', () => {
    const { facets } = filterConnections(rows, '', select({ source: ['192.168.1.60'] }));

    expect(facets.kind).toEqual([
      { value: ROUTE_KIND.Proxy, count: 1 },
      { value: ROUTE_KIND.Direct, count: 1 },
      { value: ROUTE_KIND.Block, count: 0 },
    ]);
    expect(facets.source).toEqual([
      { value: '192.168.1.36', count: 1 },
      { value: '192.168.1.60', count: 2 },
      { value: '192.168.1.120', count: 1 },
    ]);
  });

  it('counters take the search into account', () => {
    const searchable = [
      makeSearchableRow({ id: '1', host: 'claude.example:443' }),
      makeSearchableRow({ id: '2', host: 'telegram.example:443' }),
    ];

    expect(filterConnections(searchable, 'claude').facets.network).toEqual([{ value: 'tcp', count: 1 }]);
  });

  it('a change of counters between snapshots does not reorder the values', () => {
    const before = filterConnections(rows, '').facets.source.map(({ value }) => value);
    const busier = [
      ...rows,
      ...Array.from({ length: 5 }, (_, index) =>
        makeSearchableRow({ id: `x${String(index)}`, source: '192.168.1.120' })
      ),
    ];
    const after = filterConnections(busier, '').facets.source;

    expect(after.map(({ value }) => value)).toEqual(before);
    expect(after.find(({ value }) => value === '192.168.1.120')?.count).toBe(6);
  });

  it('a selected value that is not on the tab stays in the list with zero', () => {
    const { facets, rows: shown } = filterConnections(rows, '', select({ source: ['192.168.1.200'] }));

    expect(shown).toEqual([]);
    expect(facets.source).toContainEqual({ value: '192.168.1.200', count: 0 });
  });

  it('a chain node counts the row once in each node', () => {
    const { facets } = filterConnections([makeRow({ chain: ['group', 'node'] })], '');

    expect(facets.chain).toEqual([
      { value: 'group', count: 1 },
      { value: 'node', count: 1 },
    ]);
  });
});

describe('filter in the address', () => {
  it('an old link with one device and action is read as a single-value selection', () => {
    const parsed = parseConnectionSearch({ source: '192.168.1.60', kind: 'proxy' });

    expect(toFacetSelection(parsed)).toEqual(
      select({ [CONNECTION_FACET.Source]: ['192.168.1.60'], [CONNECTION_FACET.Kind]: [ROUTE_KIND.Proxy] })
    );
  });

  it('reads several values as a list', () => {
    const parsed = parseConnectionSearch({ source: ['192.168.1.60', '192.168.1.65'], network: ['tcp', 'udp'] });

    expect(toFacetSelection(parsed)).toEqual(
      select({ source: ['192.168.1.60', '192.168.1.65'], network: ['tcp', 'udp'] })
    );
  });

  it('the rule facet lives under the match key and accepts a rule without conditions', () => {
    expect(toFacetSelection(parseConnectionSearch({ match: '' }))).toEqual(select({ rule: [''] }));
    expect(toFacetSearch(select({ rule: ['rule_set=github'] })).match).toBe('rule_set=github');
  });

  it('writes one value as a string, several as a list, and does not write an empty facet at all', () => {
    expect(toFacetSearch(select({ source: ['192.168.1.60'], kind: [ROUTE_KIND.Direct, ROUTE_KIND.Block] }))).toEqual({
      source: '192.168.1.60',
      kind: [ROUTE_KIND.Direct, ROUTE_KIND.Block],
      match: undefined,
      chain: undefined,
      network: undefined,
    });
  });

  it('an unrecognized action discards the whole filter', () => {
    expect(parseConnectionSearch({ source: '192.168.1.60', kind: ['proxy', 'teleport'] })).toEqual({});
  });

  it('a selection survives the trip into the address and back', () => {
    const selection = select({
      source: ['a', 'b'],
      kind: [ROUTE_KIND.Dns],
      rule: [''],
      chain: ['x'],
      network: ['udp'],
    });

    expect(toFacetSelection(parseConnectionSearch(toFacetSearch(selection)))).toEqual(selection);
  });
});
