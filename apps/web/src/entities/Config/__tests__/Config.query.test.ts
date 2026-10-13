import { describe, expect, it } from 'vitest';

import { CONFIG_QUERY, parseConfig } from '../api/Config.query';
import { CONFIG_FIXTURE } from './Config.fixture';
import handwritten from './corpus/handwritten.jsonc?raw';

describe('CONFIG_QUERY', () => {
  it('builds a specific key from the general one so mass invalidation works', () => {
    expect(CONFIG_QUERY.all).toEqual(['config']);
    expect(CONFIG_QUERY.current()).toEqual(['config', 'current']);
  });
});

describe('parseConfig', () => {
  it('parses a config from the device without issues', () => {
    const parsed = parseConfig(JSON.stringify(CONFIG_FIXTURE));

    expect(parsed.issues).toEqual([]);
    expect(parsed.config?.route?.rules).toHaveLength(32);
  });

  it('keeps nodes that are not in the schema: they must not be lost in round-trip', () => {
    const parsed = parseConfig(JSON.stringify({ ...CONFIG_FIXTURE, unknown_section: { a: 1 } }));

    expect(parsed.issues).toEqual([]);
    expect(Reflect.get(parsed.config ?? {}, 'unknown_section')).toEqual({ a: 1 });
  });

  it('on an unparsed config returns issues instead of an empty result', () => {
    const parsed = parseConfig(JSON.stringify({ inbounds: 'не список' }));

    expect(parsed.config).toBeNull();
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0].text).toContain('inbounds');
  });

  it('names the node, the reason and the line of an invalid value in a file with comments', () => {
    const broken = handwritten.replace('"level": "info"', '"level": 42');

    expect(broken).not.toBe(handwritten);

    const parsed = parseConfig(broken);

    expect(parsed.config).toBeNull();

    const issue = parsed.issues.find((item) => item.text.includes('log.level'));

    expect(issue?.text).toContain('строка 3');
    expect(issue?.offset).toBe(broken.indexOf('"level": 42') + '"level": '.length);
  });

  it('returns the source text back: edits apply to it, not to the model', () => {
    const text = JSON.stringify(CONFIG_FIXTURE, null, 2);

    expect(parseConfig(text).text).toBe(text);
  });

  it('an empty response is also an issue, not an empty config', () => {
    const parsed = parseConfig('');

    expect(parsed.config).toBeNull();
    expect(parsed.issues).toHaveLength(1);
  });

  it('does not throw on a broken file: the panel must open on it too', () => {
    const parsed = parseConfig('{ "route": ');

    expect(parsed.config).toBeNull();
    expect(parsed.issues[0].text).toContain('не разбирается');
    expect(parsed.issues[0].offset).not.toBeNull();
  });
});
