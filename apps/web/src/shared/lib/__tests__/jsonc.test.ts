import { describe, expect, it } from 'vitest';

import { firstJsoncError, jsoncOutline, parseJsonc } from '../jsonc';

/** Line number by offset: the parse reports the position in characters. */
function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length - 1;
}

describe('config text parsing', () => {
  it('accepts comments: the binary itself accepts them', () => {
    expect(firstJsoncError('{\n  // адрес панели\n  "log": { "level": "info" }\n}')).toBeNull();
  });

  it('accepts a comma before the closing bracket', () => {
    expect(firstJsoncError('{ "outbounds": [{ "tag": "direct" },], }')).toBeNull();
  });

  it('names the error in Russian and shows where it is', () => {
    const failure = firstJsoncError('{\n  "log": { "level": "info" \n}');

    expect(failure?.text).toBe('не закрыта фигурная скобка');
    expect(lineOf('{\n  "log": { "level": "info" \n}', failure?.offset ?? 0)).toBe(2);
  });

  it('treats empty text as an error: the config cannot be empty', () => {
    expect(firstJsoncError('')).not.toBeNull();
  });
});

describe('parseJsonc', () => {
  it('returns the value with comments and a trailing comma', () => {
    const { value, failure } = parseJsonc('{\n  // хвост\n  "a": [1, 2,],\n}');

    expect(failure).toBeNull();
    expect(value).toEqual({ a: [1, 2] });
  });

  it('on broken text returns an error instead of throwing', () => {
    const { failure } = parseJsonc('{ "a": }');

    expect(failure?.text).toBe('ожидалось значение');
  });
});

describe('jsoncOutline', () => {
  const TEXT = [
    '{',
    '  // уровень логов',
    '  "log": { "level": "info" },',
    '  "route": {',
    '    "rules": [{ "outbound": "direct" }, { "outbound": "proxy" },],',
    '    "rule_set": [],',
    '    "final": "proxy",',
    '  },',
    '}',
  ].join('\n');

  it('puts root keys in their place in text with comments and a trailing comma', () => {
    const outline = jsoncOutline(TEXT);

    expect(outline.map((entry) => entry.key)).toEqual(['log', 'route']);
    expect(outline[0]).toMatchObject({ offset: TEXT.indexOf('"log"'), length: '"log"'.length, size: null });
  });

  it('under a root property lists nested objects and arrays, and skips scalars', () => {
    const route = jsoncOutline(TEXT).find((entry) => entry.key === 'route');

    expect(route?.children.map((entry) => entry.key)).toEqual(['rules', 'rule_set']);
    expect(route?.children[0]).toMatchObject({ offset: TEXT.indexOf('"rules"'), size: 2 });
    expect(route?.children[1]).toMatchObject({ size: 0 });
  });

  it('on broken text returns what was parsed before the error', () => {
    const broken = '{ "log": {}, "route": { "rules": [1, 2 "final": "x" }, "dns": {} }';

    expect(jsoncOutline(broken).map((entry) => entry.key)).toEqual(['log', 'route']);
  });

  it('text without a root object has no table of contents', () => {
    expect(jsoncOutline('[1, 2]')).toEqual([]);
    expect(jsoncOutline('')).toEqual([]);
  });
});
