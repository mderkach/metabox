import { describe, expect, it } from 'vitest';

import { firstJsoncError, jsoncOutline, parseJsonc } from '../jsonc';

/** Номер строки по смещению: разбор сообщает позицию в символах. */
function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length - 1;
}

describe('разбор текста конфига', () => {
  it('принимает комментарии — их принимает и сам бинарь', () => {
    expect(firstJsoncError('{\n  // адрес панели\n  "log": { "level": "info" }\n}')).toBeNull();
  });

  it('принимает запятую перед закрывающей скобкой', () => {
    expect(firstJsoncError('{ "outbounds": [{ "tag": "direct" },], }')).toBeNull();
  });

  it('называет ошибку по-русски и показывает, где она', () => {
    const failure = firstJsoncError('{\n  "log": { "level": "info" \n}');

    expect(failure?.text).toBe('не закрыта фигурная скобка');
    expect(lineOf('{\n  "log": { "level": "info" \n}', failure?.offset ?? 0)).toBe(2);
  });

  it('пустой текст считает ошибкой: конфиг не может быть пустым', () => {
    expect(firstJsoncError('')).not.toBeNull();
  });
});

describe('parseJsonc', () => {
  it('отдаёт значение с комментариями и висячей запятой', () => {
    const { value, failure } = parseJsonc('{\n  // хвост\n  "a": [1, 2,],\n}');

    expect(failure).toBeNull();
    expect(value).toEqual({ a: [1, 2] });
  });

  it('на битом тексте отдаёт ошибку, а не бросает', () => {
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

  it('ставит ключи корня на их место в тексте с комментариями и висячей запятой', () => {
    const outline = jsoncOutline(TEXT);

    expect(outline.map((entry) => entry.key)).toEqual(['log', 'route']);
    expect(outline[0]).toMatchObject({ offset: TEXT.indexOf('"log"'), length: '"log"'.length, size: null });
  });

  it('под свойством корня перечисляет вложенные объекты и массивы, а скаляры пропускает', () => {
    const route = jsoncOutline(TEXT).find((entry) => entry.key === 'route');

    expect(route?.children.map((entry) => entry.key)).toEqual(['rules', 'rule_set']);
    expect(route?.children[0]).toMatchObject({ offset: TEXT.indexOf('"rules"'), size: 2 });
    expect(route?.children[1]).toMatchObject({ size: 0 });
  });

  it('на битом тексте отдаёт то, что разобрано до ошибки', () => {
    const broken = '{ "log": {}, "route": { "rules": [1, 2 "final": "x" }, "dns": {} }';

    expect(jsoncOutline(broken).map((entry) => entry.key)).toEqual(['log', 'route']);
  });

  it('у текста без объекта в корне оглавления нет', () => {
    expect(jsoncOutline('[1, 2]')).toEqual([]);
    expect(jsoncOutline('')).toEqual([]);
  });
});
