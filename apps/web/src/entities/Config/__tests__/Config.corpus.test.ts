import { describe, expect, it } from 'vitest';

import { parseConfig } from '../api/Config.query';
import { findValue, readRules, setValue } from '../model/Config.model';

/**
 * The corpus is picked up as a whole directory: a new config just needs to be put
 * next to the others, no test edit required. `?raw` returns the file bytes, not a parsed
 * module: round-trip is checked on text as it lies on the device.
 */
const CORPUS = import.meta.glob<string>('./corpus/*.json*', { query: '?raw', import: 'default', eager: true });

const FILES = Object.entries(CORPUS).map(([path, text]) => ({
  name: path.replace('./corpus/', ''),
  text,
}));

/** Top-level keys in file order: by the model the order would be the schema's. */
function topLevelKeys(text: string): string[] {
  return [...text.matchAll(/^(?: {2}|\t)"([^"]+)":/gm)].map((match) => match[1]);
}

describe('config corpus', () => {
  it('the directory contains files', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES)('$name parses', ({ text }) => {
    expect(parseConfig(text).issues).toEqual([]);
  });

  it.each(FILES)('$name keeps its rules when the text is parsed', ({ text }) => {
    const fromText = readRules(text).length;
    const fromModel = parseConfig(text).config?.route?.rules?.length ?? 0;

    expect(fromText).toBe(fromModel);
  });

  it.each(FILES)('$name survives a single-field edit without losses', ({ text }) => {
    const after = setValue(text, ['route', 'final'], 'direct');

    expect(parseConfig(after).config?.route?.final).toBe('direct');
    expect(topLevelKeys(after)).toEqual(topLevelKeys(text));
  });

  it.each(FILES)('$name keeps its line endings', ({ text }) => {
    const after = setValue(text, ['route', 'final'], 'direct');
    const crlfBefore = (text.match(/\r\n/g) ?? []).length;
    const crlfAfter = (after.match(/\r\n/g) ?? []).length;

    // An edit changes one line, so the CRLF count shifts by no more
    // than that: a CRLF file must not move to LF as a whole.
    expect(Math.abs(crlfAfter - crlfBefore)).toBeLessThanOrEqual(1);
  });

  it('a config with comments keeps them after an edit', () => {
    const file = FILES.find((item) => item.name.endsWith('.jsonc'));

    expect(file).toBeDefined();

    const after = setValue(file?.text ?? '', ['route', 'final'], 'direct');

    expect(after).toContain('// Конфиг собран руками');
    expect(after).toContain('/* Порядок правил и есть логика');
  });

  it('fields the schema does not know are named one by one', () => {
    const file = FILES.find((item) => item.name === 'unknown-nodes.json');
    const parsed = parseConfig(file?.text ?? '');

    expect(parsed.config).not.toBeNull();
    expect(parsed.unknown.map((item) => item.path)).toEqual(
      expect.arrayContaining(['', 'outbounds.1', 'route.rules.0'])
    );
    expect(parsed.unknown.flatMap((item) => item.fields)).toEqual(
      expect.arrayContaining(['vendor_extension', 'unknown_option', 'unknown_matcher'])
    );
  });

  it.each(FILES.filter((item) => item.name !== 'unknown-nodes.json'))(
    '$name is accepted by the schema as a whole',
    ({ text }) => {
      expect(parseConfig(text).unknown).toEqual([]);
    }
  );

  it('editing a whole node does not touch comments and neighboring nodes', () => {
    const file = FILES.find((item) => item.name === 'handwritten.jsonc');

    expect(file).toBeDefined();

    const text = file?.text ?? '';
    const node = findValue(text, ['outbounds', 0]);

    expect(node).toBeDefined();

    const after = setValue(text, ['outbounds', 0], { ...(typeof node === 'object' ? node : {}), tag: 'renamed' });

    const commentsOf = (source: string) => source.split('\n').filter((line) => line.includes('//')).length;

    expect(commentsOf(after)).toBe(commentsOf(text));
    expect(topLevelKeys(after)).toEqual(topLevelKeys(text));
    expect(JSON.stringify(findValue(after, ['outbounds', 1]))).toBe(JSON.stringify(findValue(text, ['outbounds', 1])));
    expect(findValue(after, ['outbounds', 0, 'tag'])).toBe('renamed');
  });

  it('unknown nodes survive an edit of a neighboring field', () => {
    const file = FILES.find((item) => item.name === 'unknown-nodes.json');

    expect(file).toBeDefined();

    const after = setValue(file?.text ?? '', ['log', 'level'], 'debug');
    const parsed = parseConfig(after).config;

    expect(Reflect.get(parsed ?? {}, 'vendor_extension')).toEqual({
      enabled: true,
      profiles: [{ name: 'own', weight: 3 }],
    });
    expect(after).toContain('"unknown_matcher"');
    expect(after).toContain('"unknown_option"');
  });
});
