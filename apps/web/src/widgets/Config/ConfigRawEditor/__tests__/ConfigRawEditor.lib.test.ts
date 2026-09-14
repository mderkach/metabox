import { describe, expect, it } from 'vitest';

import { findMatches, firstParseError, lineIndexOf, toJsonTokens } from '../lib/ConfigRawEditor.lib';

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

describe('разбор текста конфига', () => {
  it('принимает комментарии — их принимает и сам бинарь', () => {
    expect(firstParseError('{\n  // адрес панели\n  "log": { "level": "info" }\n}')).toBeNull();
  });

  it('принимает запятую перед закрывающей скобкой', () => {
    expect(firstParseError('{ "outbounds": [{ "tag": "direct" },], }')).toBeNull();
  });

  it('называет ошибку по-русски и показывает, где она', () => {
    const failure = firstParseError('{\n  "log": { "level": "info" \n}');

    expect(failure?.text).toBe('не закрыта фигурная скобка');
    expect(lineIndexOf('{\n  "log": { "level": "info" \n}', failure?.offset ?? 0)).toBe(2);
  });

  it('пустой текст считает ошибкой: конфиг не может быть пустым', () => {
    expect(firstParseError('')).not.toBeNull();
  });
});
