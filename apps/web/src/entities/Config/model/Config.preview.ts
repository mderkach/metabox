import { visit, type JSONPath } from 'jsonc-parser';

import { maskPrivateUrl } from '@shared/lib/maskPrivateUrl';

import { CONFIG_SECTION } from './Config.model';

const OUTBOUND_SECRETS = new Set([
  'uuid',
  'password',
  'plugin_opts',
  'obfs.password',
  'tls.reality.public_key',
  'tls.reality.short_id',
  'transport.path',
  'transport.service_name',
]);

function previewValue(path: JSONPath, value: string): string {
  const [section, index, ...keys] = path;
  if (typeof index !== 'number') return value;
  if (section === CONFIG_SECTION.Providers && keys.length === 1 && keys[0] === 'url') {
    return maskPrivateUrl(value);
  }
  if (
    section === CONFIG_SECTION.Outbounds &&
    (OUTBOUND_SECRETS.has(keys.join('.')) || (keys[0] === 'transport' && keys[1] === 'headers'))
  ) {
    return '••••••';
  }

  return value;
}

export function maskConfigPreviewLines(text: string): ReadonlyMap<number, string> {
  const replacements = new Map<number, string>();
  const lines = text.split('\n');

  visit(text, {
    onLiteralValue(value: unknown, _offset, length, line, column, path) {
      if (typeof value !== 'string' || value === '') return;

      const source = lines[line];
      const current = replacements.get(line + 1) ?? source;
      const masked = previewValue(path(), value);

      if (masked !== value) {
        const start = column + current.length - source.length;
        replacements.set(line + 1, current.slice(0, start) + JSON.stringify(masked) + current.slice(start + length));
      }
    },
  });

  return replacements;
}
