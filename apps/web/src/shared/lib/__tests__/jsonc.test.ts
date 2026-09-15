import { describe, expect, it } from 'vitest';

import { firstJsoncError, parseJsonc } from '../jsonc';

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
