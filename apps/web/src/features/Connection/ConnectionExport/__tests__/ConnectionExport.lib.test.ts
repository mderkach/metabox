import { describe, expect, it } from 'vitest';

import type { ConnectionRow } from '@entities/Connection';

import { EXPORT_FORMAT, toExportBody } from '../lib/ConnectionExport.lib';

function makeRow(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: 'c1',
    host: 'api.anthropic.example:443',
    network: 'tcp',
    source: '192.168.1.60',
    rule: 'rule_set=anthropic',
    outcome: 'route(us-west-fallback)',
    chain: ['us-west-fallback', 'us-west'],
    upload: 2048,
    download: 4096,
    downRate: 128.7,
    upRate: 0,
    startedAt: Date.parse('2026-09-13T12:00:00.000Z'),
    searchText: 'api.anthropic.example:443 192.168.1.60 tcp rule_set=anthropic route(us-west-fallback)',
    ...overrides,
  };
}

describe('выгрузка соединений', () => {
  it('CSV начинается с шапки колонок', () => {
    const [header] = toExportBody([makeRow()], EXPORT_FORMAT.Csv).split('\n');

    expect(header).toBe('host,source,network,rule,outcome,chain,download,upload,downRate,upRate,startedAt');
  });

  it('CSV пишет строку данных под шапкой', () => {
    const [, row] = toExportBody([makeRow()], EXPORT_FORMAT.Csv).split('\n');

    expect(row).toContain('api.anthropic.example:443');
    expect(row).toContain('us-west-fallback → us-west');
    expect(row).toContain('2026-09-13T12:00:00.000Z');
  });

  it('скорость округляет до байта: дробные доли в выгрузке не нужны', () => {
    const [, row] = toExportBody([makeRow()], EXPORT_FORMAT.Csv).split('\n');

    expect(row).toContain(',129,0,');
  });

  it('запятую и кавычку в значении экранирует по RFC 4180', () => {
    const [, row] = toExportBody([makeRow({ rule: 'ip_cidr=[10.0.0.0/8, 172.16.0.0/12]' })], EXPORT_FORMAT.Csv).split(
      '\n'
    );

    expect(row).toContain('"ip_cidr=[10.0.0.0/8, 172.16.0.0/12]"');

    const [, quoted] = toExportBody([makeRow({ host: 'he said "hi"' })], EXPORT_FORMAT.Csv).split('\n');

    expect(quoted).toContain('"he said ""hi"""');
  });

  it('пустой список даёт одну шапку без строк', () => {
    expect(toExportBody([], EXPORT_FORMAT.Csv).split('\n')).toHaveLength(1);
  });

  it('JSON отдаёт модель строки как есть', () => {
    const parsed: unknown = JSON.parse(toExportBody([makeRow()], EXPORT_FORMAT.Json));

    expect(parsed).toEqual([makeRow()]);
  });
});
