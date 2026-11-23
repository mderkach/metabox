import { visit } from 'jsonc-parser';

import { maskPrivateUrl } from '@shared/lib/maskPrivateUrl';

import { CONFIG_SECTION } from './Config.model';

export function maskSubscriptionUrlLines(text: string): ReadonlyMap<number, string> {
  const replacements = new Map<number, string>();
  const lines = text.split('\n');

  visit(text, {
    onLiteralValue(value: unknown, _offset, length, line, column, path) {
      const [section, index, key, ...rest] = path();
      if (
        section !== CONFIG_SECTION.Providers ||
        typeof index !== 'number' ||
        key !== 'url' ||
        rest.length !== 0 ||
        typeof value !== 'string' ||
        value === ''
      ) {
        return;
      }

      const source = lines[line];
      const current = replacements.get(line + 1) ?? source;
      const masked = maskPrivateUrl(value);

      if (masked !== value) {
        const start = column + current.length - source.length;
        replacements.set(line + 1, current.slice(0, start) + JSON.stringify(masked) + current.slice(start + length));
      }
    },
  });

  return replacements;
}
