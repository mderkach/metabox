import { describe, expect, it } from 'vitest';

import { indentLines, indentUnit, lineIndexOf, toJsonTokens, tokenIndexAt } from '../JsonTextarea.lib';

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

/** Text after an edit, with the selection marked by `[` and `]`. */
function pressTab(marked: string, unit: string, outdent = false): string {
  const start = marked.indexOf('[');
  const end = marked.indexOf(']') - 1;
  const text = marked.replace('[', '').replace(']', '');
  const edit = indentLines(text, start, end, unit, outdent);

  if (edit === null) {
    return marked;
  }

  const after = text.slice(0, edit.from) + edit.text + text.slice(edit.to);

  return `${after.slice(0, edit.selectionStart)}[${after.slice(edit.selectionStart, edit.selectionEnd)}]${after.slice(edit.selectionEnd)}`;
}

describe('indent unit of the text', () => {
  it('takes spaces of the first indented line', () => {
    expect(indentUnit('{\n    "a": {\n      "b": 1\n    }\n}')).toBe('    ');
  });

  it('takes a tab when the text is indented with tabs', () => {
    expect(indentUnit('{\n\t"a": 1\n}')).toBe('\t');
  });

  it('falls back to two spaces when nothing is indented', () => {
    expect(indentUnit('{"a": 1}')).toBe('  ');
  });
});

describe('Tab and Shift+Tab over lines', () => {
  it('inserts one unit at a caret', () => {
    expect(pressTab('{\n[]"a": 1\n}', '  ')).toBe('{\n  []"a": 1\n}');
  });

  it('replaces a selection inside one line with one unit', () => {
    expect(pressTab('{"a": [1]}', '\t')).toBe('{"a": \t[]}');
  });

  it('indents every non-empty selected line and keeps the lines selected', () => {
    expect(pressTab('{\n["a": 1,\n\n"b": 2]\n}', '  ')).toBe('{\n[  "a": 1,\n\n  "b": 2]\n}');
  });

  it('moves a selection edge inside a line together with the text', () => {
    expect(pressTab('{\n"a[": 1,\n"b]": 2\n}', '  ')).toBe('{\n  "a[": 1,\n  "b]": 2\n}');
  });

  it('leaves the line alone when the selection ends at its start', () => {
    expect(pressTab('[a\nb\n]c', '  ')).toBe('[  a\n  b\n]c');
  });

  it('outdents the line of a caret by one unit', () => {
    expect(pressTab('{\n    "a"[]: 1\n}', '  ', true)).toBe('{\n  "a"[]: 1\n}');
  });

  it('outdents each selected line by what it has, up to one unit', () => {
    expect(pressTab('[\t\ta\n b\nc]', '\t', true)).toBe('[\ta\nb\nc]');
  });

  it('keeps a caret inside the removed indent at the line start', () => {
    expect(pressTab(' [] a', '  ', true)).toBe('[]a');
  });

  it('keeps the carriage return of CRLF lines', () => {
    expect(pressTab('[a\r\nb]', '  ')).toBe('[  a\r\n  b]');
  });

  it('outdents nothing below an empty first line when the caret is on it', () => {
    expect(indentLines('\n  a', 0, 0, '  ', true)).toBeNull();
  });

  it('changes nothing when there is nothing to outdent', () => {
    expect(indentLines('a\nb', 0, 3, '  ', true)).toBeNull();
  });
});
