import { describe, expect, it } from 'vitest';

import { findMatches, lineIndexOf, toJsonTokens, tokenIndexAt } from '../lib/ConfigRawEditor.lib';

describe('разбор конфига на цветные куски', () => {
  it('склеенные куски дословно повторяют исходный текст', () => {
    const text = '{\n  "tag": "direct",\n  "port": 53,\n  "tls": { "enabled": true }\n}\n';

    expect(
      toJsonTokens(text)
        .map((token) => token.text)
        .join('')
    ).toBe(text);
  });

  it('ключ и строковое значение красит по-разному', () => {
    const tokens = toJsonTokens('{"tag":"direct"}');
    const strings = tokens.filter((token) => token.text.startsWith('"'));

    expect(strings).toHaveLength(2);
    expect(strings[0].tone).not.toBe(strings[1].tone);
  });

  it('ключ узнаёт и через перевод строки перед двоеточием', () => {
    const tokens = toJsonTokens('{\n  "tag"\n  : "direct"\n}');
    const key = tokens.find((token) => token.text === '"tag"');
    const value = tokens.find((token) => token.text === '"direct"');

    expect(key?.tone).not.toBe(value?.tone);
  });

  it('битый текст не роняет разбор: подсветка нужна как раз тогда, когда JSON не читается', () => {
    const text = '{"tag": "direct",,}';

    expect(
      toJsonTokens(text)
        .map((token) => token.text)
        .join('')
    ).toBe(text);
  });

  it('на пустом тексте отдаёт пустой список', () => {
    expect(toJsonTokens('')).toEqual([]);
  });
});

describe('поиск по тексту', () => {
  it('находит все вхождения и не различает регистр', () => {
    expect(findMatches('direct Direct DIRECT', 'direct')).toEqual([0, 7, 14]);
  });

  it('пустой запрос не ищет ничего', () => {
    expect(findMatches('direct', '')).toEqual([]);
  });

  it('вхождения не перекрываются', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([0, 2]);
  });
});

describe('номер строки по позиции', () => {
  it('первая строка нулевая', () => {
    expect(lineIndexOf('a\nb\nc', 0)).toBe(0);
  });

  it('считает переводы строки до позиции, а не включая её', () => {
    expect(lineIndexOf('a\nb\nc', 2)).toBe(1);
    expect(lineIndexOf('a\nb\nc', 4)).toBe(2);
  });
});

describe('кусок подсветки по позиции текста', () => {
  it('находит кусок, в который попадает позиция', () => {
    const text = '{"tag": "direct"}';
    const tokens = toJsonTokens(text);

    expect(tokens[tokenIndexAt(tokens, text.indexOf('direct'))].text).toBe('"direct"');
  });

  it('позиция в конце текста даёт последний кусок', () => {
    const tokens = toJsonTokens('{}');

    expect(tokenIndexAt(tokens, 2)).toBe(tokens.length - 1);
  });
});
