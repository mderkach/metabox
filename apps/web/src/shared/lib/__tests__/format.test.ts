import { describe, expect, it } from 'vitest';

import { formatAge, formatDate, formatDateTime } from '../format';

describe('возраст соединения', () => {
  it('на первой минуте считает секундами', () => {
    expect(formatAge(0)).toBe('0 с');
    expect(formatAge(59.9)).toBe('59 с');
  });

  it('отрицательный возраст не показывает: часы браузера и устройства расходятся', () => {
    expect(formatAge(-3)).toBe('0 с');
  });

  it('дальше минуты округляет вниз до минут, часов и суток', () => {
    expect(formatAge(60)).toBe('1 мин');
    expect(formatAge(3599)).toBe('59 мин');
    expect(formatAge(3600)).toBe('1 ч');
    expect(formatAge(86_399)).toBe('23 ч');
    expect(formatAge(86_400)).toBe('1 д');
  });
});

describe('дата', () => {
  const at = new Date(2025, 8, 11, 17, 13, 20);

  it('печатает дату цифрами в порядке языка интерфейса', () => {
    expect(formatDate(at)).toBe('11.09.2025');
  });

  it('с временем печатает ту же дату и время до минуты', () => {
    expect(formatDateTime(at)).toBe('11.09.2025, 17:13');
  });
});
