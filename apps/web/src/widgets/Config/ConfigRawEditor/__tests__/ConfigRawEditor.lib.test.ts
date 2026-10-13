import { describe, expect, it } from 'vitest';

import { findMatches, lineIndexOf, toJsonTokens, tokenIndexAt } from '../lib/ConfigRawEditor.lib';

describe('config split into colored chunks', () => {
  it('joined chunks repeat the source text verbatim', () => {
    const text = '{\n  "tag": "direct",\n  "port": 53,\n  "tls": { "enabled": true }\n}\n';

    expect(
      toJsonTokens(text)
        .map((token) => token.text)
        .join('')
    ).toBe(text);
  });

  it('colors a key and a string value differently', () => {
    const tokens = toJsonTokens('{"tag":"direct"}');
    const strings = tokens.filter((token) => token.text.startsWith('"'));

    expect(strings).toHaveLength(2);
    expect(strings[0].tone).not.toBe(strings[1].tone);
  });

  it('recognizes a key across a line break before the colon', () => {
    const tokens = toJsonTokens('{\n  "tag"\n  : "direct"\n}');
    const key = tokens.find((token) => token.text === '"tag"');
    const value = tokens.find((token) => token.text === '"direct"');

    expect(key?.tone).not.toBe(value?.tone);
  });

  it('broken text does not crash the parse: highlighting is needed exactly when JSON is unreadable', () => {
    const text = '{"tag": "direct",,}';

    expect(
      toJsonTokens(text)
        .map((token) => token.text)
        .join('')
    ).toBe(text);
  });

  it('on empty text returns an empty list', () => {
    expect(toJsonTokens('')).toEqual([]);
  });
});

describe('text search', () => {
  it('finds all occurrences and is case-insensitive', () => {
    expect(findMatches('direct Direct DIRECT', 'direct')).toEqual([0, 7, 14]);
  });

  it('an empty query searches for nothing', () => {
    expect(findMatches('direct', '')).toEqual([]);
  });

  it('occurrences do not overlap', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([0, 2]);
  });
});

describe('line number by position', () => {
  it('the first line is zero', () => {
    expect(lineIndexOf('a\nb\nc', 0)).toBe(0);
  });

  it('counts line breaks up to the position, not including it', () => {
    expect(lineIndexOf('a\nb\nc', 2)).toBe(1);
    expect(lineIndexOf('a\nb\nc', 4)).toBe(2);
  });
});

describe('highlight chunk by text position', () => {
  it('finds the chunk the position falls into', () => {
    const text = '{"tag": "direct"}';
    const tokens = toJsonTokens(text);

    expect(tokens[tokenIndexAt(tokens, text.indexOf('direct'))].text).toBe('"direct"');
  });

  it('a position at the end of the text gives the last chunk', () => {
    const tokens = toJsonTokens('{}');

    expect(tokenIndexAt(tokens, 2)).toBe(tokens.length - 1);
  });
});
