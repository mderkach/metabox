import { describe, expect, it } from 'vitest';

import { listToText, packList, parseNumber, parseScalar, textToList, UNSET } from '../model';

describe('значения полей формы узла', () => {
  it('многострочное поле отдаёт значения без пустых строк и пробелов по краям', () => {
    expect(textToList(' a.example \n\n b.example ', false)).toEqual(['a.example', 'b.example']);
  });

  it('одно значение listable-поля остаётся строкой, обычного списка — списком', () => {
    expect(textToList('h2', true)).toBe('h2');
    expect(textToList('h2', false)).toEqual(['h2']);
    expect(packList(['tcp', 'udp'], true)).toEqual(['tcp', 'udp']);
  });

  it('пустой список значит «ключа нет»', () => {
    expect(textToList('\n  \n', true)).toBe(UNSET);
    expect(packList([], false)).toBe(UNSET);
  });

  it('listable-строка показывается одной строкой, список — по значению на строку', () => {
    expect(listToText('h2')).toBe('h2');
    expect(listToText(['h2', 'http/1.1'])).toBe('h2\nhttp/1.1');
  });

  it('поле «строка или число» отдаёт цифры числом, прочее — строкой', () => {
    expect(parseScalar('255')).toBe(255);
    expect(parseScalar('0xff')).toBe('0xff');
    expect(parseScalar('  ')).toBe(UNSET);
  });

  it('пустое числовое поле значит «ключа нет»', () => {
    expect(parseNumber('')).toBe(UNSET);
    expect(parseNumber('443')).toBe(443);
  });
});
