import { describe, expect, it } from 'vitest';

import { filterConnections, toKindGroups, toSourceGroups } from '../model/Connection.filter';
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

describe('поиск по соединению', () => {
  const rows = [makeSearchableRow()];

  it('пустой запрос пропускает всё', () => {
    expect(filterConnections(rows, '   ', null)).toHaveLength(1);
  });

  it('не различает регистр', () => {
    expect(filterConnections(rows, 'ANTHROPIC', null)).toHaveLength(1);
  });

  it('требует совпадения всех слов, а не любого', () => {
    expect(filterConnections(rows, 'anthropic us-west', null)).toHaveLength(1);
    expect(filterConnections(rows, 'anthropic telegram', null)).toHaveLength(0);
  });

  it('ищет и по узлам цепочки', () => {
    expect(filterConnections(rows, 'sub-us', null)).toHaveLength(1);
  });

  it('ищет по источнику и протоколу', () => {
    expect(filterConnections([makeSearchableRow({ network: 'udp' })], '192.168.1.60 udp', null)).toHaveLength(1);
  });
});

describe('поиск по подписи устройства', () => {
  const rows = [makeSearchableRow(), makeSearchableRow({ id: 'c2', source: '192.168.1.36' })];
  const LABELS = new Map([['192.168.1.60', 'Ноутбук гостя']]);

  function sourceLabel(ip: string): string {
    return LABELS.get(ip) ?? ip;
  }

  it('находит соединение по имени устройства, хотя в строке поиска лежит адрес', () => {
    expect(filterConnections(rows, 'ноутбук', null, null, sourceLabel).map((row) => row.id)).toEqual(['c1']);
  });

  it('слова запроса могут делиться между подписью и остальными полями', () => {
    expect(filterConnections(rows, 'гостя anthropic', null, null, sourceLabel)).toHaveLength(1);
    expect(filterConnections(rows, 'гостя telegram', null, null, sourceLabel)).toHaveLength(0);
  });

  it('без подписи ищет только по адресу', () => {
    expect(filterConnections(rows, 'ноутбук', null)).toHaveLength(0);
    expect(filterConnections(rows, '192.168.1.36', null, null, sourceLabel).map((row) => row.id)).toEqual(['c2']);
  });
});

describe('устройства-источники', () => {
  it('считает соединения и ставит частые первыми', () => {
    const rows = [
      makeRow({ id: '1', source: '192.168.1.65' }),
      makeRow({ id: '2', source: '192.168.1.60' }),
      makeRow({ id: '3', source: '192.168.1.60' }),
    ];

    expect(toSourceGroups(rows)).toEqual([
      { source: '192.168.1.60', count: 2 },
      { source: '192.168.1.65', count: 1 },
    ]);
  });

  it('при равном числе соединений сортирует по адресу', () => {
    const rows = [makeRow({ id: '1', source: '192.168.1.65' }), makeRow({ id: '2', source: '192.168.1.60' })];

    expect(toSourceGroups(rows).map((group) => group.source)).toEqual(['192.168.1.60', '192.168.1.65']);
  });

  it('на пустом списке отдаёт пустой список', () => {
    expect(toSourceGroups([])).toEqual([]);
  });
});

describe('судьбы пакета', () => {
  it('держит заданный порядок, а не порядок по числу соединений', () => {
    const rows = [
      makeRow({ id: '1', kind: ROUTE_KIND.Block }),
      makeRow({ id: '2', kind: ROUTE_KIND.Direct }),
      makeRow({ id: '3', kind: ROUTE_KIND.Direct }),
      makeRow({ id: '4', kind: ROUTE_KIND.Proxy }),
    ];

    expect(toKindGroups(rows)).toEqual([
      { kind: ROUTE_KIND.Proxy, count: 1 },
      { kind: ROUTE_KIND.Direct, count: 2 },
      { kind: ROUTE_KIND.Block, count: 1 },
    ]);
  });

  it('пустые группы не показывает', () => {
    expect(toKindGroups([makeRow({ kind: ROUTE_KIND.Dns })])).toEqual([{ kind: ROUTE_KIND.Dns, count: 1 }]);
  });

  it('на пустом списке отдаёт пустой список', () => {
    expect(toKindGroups([])).toEqual([]);
  });
});

describe('отбор соединений', () => {
  const rows = [
    makeSearchableRow({ id: '1', source: '192.168.1.60', host: 'claude.example:443' }),
    makeSearchableRow({
      id: '2',
      source: '192.168.1.65',
      host: 'telegram.example:443',
      rule: '',
      kind: ROUTE_KIND.Direct,
      chain: ['direct'],
    }),
  ];

  it('без устройства и запроса отдаёт всё', () => {
    expect(filterConnections(rows, '', null)).toHaveLength(2);
  });

  it('сужает по устройству', () => {
    expect(filterConnections(rows, '', '192.168.1.65').map((row) => row.id)).toEqual(['2']);
  });

  it('складывает устройство и запрос, а не выбирает одно из них', () => {
    expect(filterConnections(rows, 'claude', '192.168.1.65')).toEqual([]);
    expect(filterConnections(rows, 'claude', '192.168.1.60').map((row) => row.id)).toEqual(['1']);
  });

  it('сужает по действию', () => {
    expect(filterConnections(rows, '', null, ROUTE_KIND.Direct).map((row) => row.id)).toEqual(['2']);
  });

  it('складывает действие с устройством и запросом', () => {
    expect(filterConnections(rows, '', '192.168.1.60', ROUTE_KIND.Direct)).toEqual([]);
    expect(filterConnections(rows, 'telegram', '192.168.1.65', ROUTE_KIND.Direct).map((row) => row.id)).toEqual(['2']);
  });
});
