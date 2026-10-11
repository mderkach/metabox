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

/** Поле поиска собирает адаптер; в фикстуре собираем по тем же полям. */
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

describe('поиск по соединению', () => {
  const rows = [makeSearchableRow()];

  it('пустой запрос пропускает всё', () => {
    expect(search(rows, '   ')).toHaveLength(1);
  });

  it('не различает регистр', () => {
    expect(search(rows, 'ANTHROPIC')).toHaveLength(1);
  });

  it('требует совпадения всех слов, а не любого', () => {
    expect(search(rows, 'anthropic us-west')).toHaveLength(1);
    expect(search(rows, 'anthropic telegram')).toHaveLength(0);
  });

  it('ищет и по узлам цепочки', () => {
    expect(search(rows, 'sub-us')).toHaveLength(1);
  });

  it('ищет по источнику и протоколу', () => {
    expect(search([makeSearchableRow({ network: 'udp' })], '192.168.1.60 udp')).toHaveLength(1);
  });
});

describe('поиск по подписи устройства', () => {
  const rows = [makeSearchableRow(), makeSearchableRow({ id: 'c2', source: '192.168.1.36' })];
  const LABELS = new Map([['192.168.1.60', 'Ноутбук гостя']]);

  function sourceLabel(ip: string): string {
    return LABELS.get(ip) ?? ip;
  }

  it('находит соединение по имени устройства, хотя в строке поиска лежит адрес', () => {
    expect(ids(search(rows, 'ноутбук', sourceLabel))).toEqual(['c1']);
  });

  it('слова запроса могут делиться между подписью и остальными полями', () => {
    expect(search(rows, 'гостя anthropic', sourceLabel)).toHaveLength(1);
    expect(search(rows, 'гостя telegram', sourceLabel)).toHaveLength(0);
  });

  it('без подписи ищет только по адресу', () => {
    expect(search(rows, 'ноутбук')).toHaveLength(0);
    expect(ids(search(rows, '192.168.1.36', sourceLabel))).toEqual(['c2']);
  });
});

describe('отбор фасетами', () => {
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

  it('без выбора и запроса отдаёт всё', () => {
    expect(filterConnections(rows, '').rows).toHaveLength(3);
  });

  it('внутри фасета складывает значения через «или»', () => {
    const { rows: shown } = filterConnections(rows, '', select({ source: ['192.168.1.60', '192.168.1.65'] }));

    expect(ids(shown)).toEqual(['1', '2']);
  });

  it('между фасетами складывает через «и», и с запросом тоже', () => {
    expect(filterConnections(rows, '', select({ source: ['192.168.1.60'], kind: [ROUTE_KIND.Direct] })).rows).toEqual(
      []
    );
    expect(ids(filterConnections(rows, 'telegram', select({ kind: [ROUTE_KIND.Direct] })).rows)).toEqual(['2']);
    expect(filterConnections(rows, 'claude', select({ kind: [ROUTE_KIND.Direct] })).rows).toEqual([]);
  });

  it('отбирает по любому узлу цепочки: и по группе, и по узлу за ней', () => {
    expect(ids(filterConnections(rows, '', select({ chain: ['sub-us/USA'] })).rows)).toEqual(['1']);
    expect(ids(filterConnections(rows, '', select({ chain: ['us-west-fallback', 'block'] })).rows)).toEqual(['1', '3']);
  });

  it('правило без условий — отдельное значение фасета', () => {
    expect(ids(filterConnections(rows, '', select({ rule: [''] })).rows)).toEqual(['2']);
  });

  it('отбирает по сети', () => {
    expect(ids(filterConnections(rows, '', select({ network: ['udp'] })).rows)).toEqual(['2']);
  });
});

describe('значения и счётчики фасетов', () => {
  const rows = [
    makeSearchableRow({ id: '1', source: '192.168.1.60', kind: ROUTE_KIND.Proxy }),
    makeSearchableRow({ id: '2', source: '192.168.1.60', kind: ROUTE_KIND.Direct }),
    makeSearchableRow({ id: '3', source: '192.168.1.120', kind: ROUTE_KIND.Direct }),
    makeSearchableRow({ id: '4', source: '192.168.1.36', kind: ROUTE_KIND.Block }),
  ];

  it('без отбора считает строки каждого значения по вкладке целиком', () => {
    const { facets } = filterConnections(rows, '');

    expect(facets.kind).toEqual([
      { value: ROUTE_KIND.Proxy, count: 1 },
      { value: ROUTE_KIND.Direct, count: 2 },
      { value: ROUTE_KIND.Block, count: 1 },
    ]);
  });

  it('держит порядок значений, а не порядок по числу строк: адреса — по числам в них', () => {
    const { facets } = filterConnections(rows, '');

    expect(facets.source.map(({ value }) => value)).toEqual(['192.168.1.36', '192.168.1.60', '192.168.1.120']);
  });

  it('устройства упорядочены по подписи, а не по адресу', () => {
    const labels = new Map([['192.168.1.120', '0-роутер']]);
    const { facets } = filterConnections(rows, '', EMPTY_FACET_SELECTION, (ip) => labels.get(ip) ?? ip);

    expect(facets.source.map(({ value }) => value)).toEqual(['192.168.1.120', '192.168.1.36', '192.168.1.60']);
  });

  it('сначала устройства с именем, затем безымянные адреса сети, в конце чужие адреса', () => {
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

  it('свой выбор счётчики фасета не трогает: значение не исчезает и не обнуляется', () => {
    const { facets } = filterConnections(rows, '', select({ kind: [ROUTE_KIND.Block] }));

    expect(facets.kind).toEqual([
      { value: ROUTE_KIND.Proxy, count: 1 },
      { value: ROUTE_KIND.Direct, count: 2 },
      { value: ROUTE_KIND.Block, count: 1 },
    ]);
  });

  it('выбор соседнего фасета сужает счётчики, а значения оставляет', () => {
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

  it('счётчики учитывают поиск', () => {
    const searchable = [
      makeSearchableRow({ id: '1', host: 'claude.example:443' }),
      makeSearchableRow({ id: '2', host: 'telegram.example:443' }),
    ];

    expect(filterConnections(searchable, 'claude').facets.network).toEqual([{ value: 'tcp', count: 1 }]);
  });

  it('смена счётчиков между снапшотами не переставляет значения', () => {
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

  it('выбранное значение, которого во вкладке нет, остаётся в списке с нулём', () => {
    const { facets, rows: shown } = filterConnections(rows, '', select({ source: ['192.168.1.200'] }));

    expect(shown).toEqual([]);
    expect(facets.source).toContainEqual({ value: '192.168.1.200', count: 0 });
  });

  it('узел цепочки считает строку один раз в каждом узле', () => {
    const { facets } = filterConnections([makeRow({ chain: ['group', 'node'] })], '');

    expect(facets.chain).toEqual([
      { value: 'group', count: 1 },
      { value: 'node', count: 1 },
    ]);
  });
});

describe('отбор в адресе', () => {
  it('старая ссылка с одним устройством и действием читается как выбор одного значения', () => {
    const parsed = parseConnectionSearch({ source: '192.168.1.60', kind: 'proxy' });

    expect(toFacetSelection(parsed)).toEqual(
      select({ [CONNECTION_FACET.Source]: ['192.168.1.60'], [CONNECTION_FACET.Kind]: [ROUTE_KIND.Proxy] })
    );
  });

  it('читает несколько значений списком', () => {
    const parsed = parseConnectionSearch({ source: ['192.168.1.60', '192.168.1.65'], network: ['tcp', 'udp'] });

    expect(toFacetSelection(parsed)).toEqual(
      select({ source: ['192.168.1.60', '192.168.1.65'], network: ['tcp', 'udp'] })
    );
  });

  it('фасет правила живёт под ключом match и принимает правило без условий', () => {
    expect(toFacetSelection(parseConnectionSearch({ match: '' }))).toEqual(select({ rule: [''] }));
    expect(toFacetSearch(select({ rule: ['rule_set=github'] })).match).toBe('rule_set=github');
  });

  it('одно значение пишет строкой, несколько — списком, пустой фасет не пишет вовсе', () => {
    expect(toFacetSearch(select({ source: ['192.168.1.60'], kind: [ROUTE_KIND.Direct, ROUTE_KIND.Block] }))).toEqual({
      source: '192.168.1.60',
      kind: [ROUTE_KIND.Direct, ROUTE_KIND.Block],
      match: undefined,
      chain: undefined,
      network: undefined,
    });
  });

  it('непонятое действие отбрасывает отбор целиком', () => {
    expect(parseConnectionSearch({ source: '192.168.1.60', kind: ['proxy', 'teleport'] })).toEqual({});
  });

  it('выбор переживает дорогу в адрес и обратно', () => {
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
