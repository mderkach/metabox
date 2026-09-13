import { describe, expect, it } from 'vitest';

import { formatAge } from '../format';

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
