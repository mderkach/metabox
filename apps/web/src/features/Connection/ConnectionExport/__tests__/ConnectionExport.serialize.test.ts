import { describe, expect, it } from 'vitest';

import { ROUTE_KIND, type ConnectionRow } from '@entities/Connection';
import { deviceLabel, toDeviceIndex } from '@entities/Device';
import { DEVICES_FIXTURE } from '@entities/Device/__tests__/Device.fixture';

import { toExportBody } from '../lib/ConnectionExport.serialize';
import { EXPORT_FORMAT } from '../model/ConnectionExport.constants';

function makeRow(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: 'c1',
    host: 'api.anthropic.example:443',
    network: 'tcp',
    source: '192.168.1.60',
    rule: 'rule_set=anthropic',
    action: 'route(us-west-fallback)',
    kind: ROUTE_KIND.Proxy,
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

const DEVICES = toDeviceIndex(DEVICES_FIXTURE);

function sourceLabel(ip: string): string {
  return deviceLabel(ip, DEVICES);
}

describe('connections export', () => {
  it('CSV starts with the column header', () => {
    const [header] = toExportBody([makeRow()], EXPORT_FORMAT.Csv, sourceLabel).split('\n');

    expect(header).toBe('host,device,source,network,rule,action,chain,download,upload,downRate,upRate,startedAt');
  });

  it('CSV carries both the device label and the source address', () => {
    const [, row] = toExportBody([makeRow()], EXPORT_FORMAT.Csv, sourceLabel).split('\n');

    expect(row.startsWith('api.anthropic.example:443,Ноутбук,192.168.1.60,')).toBe(true);
  });

  it('a device without a name is labeled by address in both columns', () => {
    const [, row] = toExportBody([makeRow({ source: '10.0.0.9' })], EXPORT_FORMAT.Csv, sourceLabel).split('\n');

    expect(row).toContain(',10.0.0.9,10.0.0.9,');
  });

  it('CSV writes a data row under the header', () => {
    const [, row] = toExportBody([makeRow()], EXPORT_FORMAT.Csv, sourceLabel).split('\n');

    expect(row).toContain('api.anthropic.example:443');
    expect(row).toContain('us-west-fallback → us-west');
    expect(row).toContain('2026-09-13T12:00:00.000Z');
  });

  it('rounds speed to the byte: fractional parts are not needed in the export', () => {
    const [, row] = toExportBody([makeRow()], EXPORT_FORMAT.Csv, sourceLabel).split('\n');

    expect(row).toContain(',129,0,');
  });

  it('escapes a comma and a quote in a value per RFC 4180', () => {
    const [, row] = toExportBody(
      [makeRow({ rule: 'ip_cidr=[10.0.0.0/8, 172.16.0.0/12]' })],
      EXPORT_FORMAT.Csv,
      sourceLabel
    ).split('\n');

    expect(row).toContain('"ip_cidr=[10.0.0.0/8, 172.16.0.0/12]"');

    const [, quoted] = toExportBody([makeRow({ host: 'he said "hi"' })], EXPORT_FORMAT.Csv, sourceLabel).split('\n');

    expect(quoted).toContain('"he said ""hi"""');
  });

  it('an empty list gives one header without rows', () => {
    expect(toExportBody([], EXPORT_FORMAT.Csv, sourceLabel).split('\n')).toHaveLength(1);
  });

  it('JSON returns the screen columns with the device label and does not export the search index', () => {
    const { searchText: _searchText, ...columns } = makeRow();
    const parsed: unknown = JSON.parse(toExportBody([makeRow()], EXPORT_FORMAT.Json, sourceLabel));

    expect(parsed).toEqual([{ ...columns, device: 'Ноутбук' }]);
  });
});
