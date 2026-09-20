import { describe, expect, it } from 'vitest';

import { DAYS_IN_WEEK, MS_IN_DAY, MS_IN_HOUR } from '@shared/lib/time';

import { parseDuration } from '../model/RuleSet.duration';

describe('разбор длительности', () => {
  it('складывает части одной записи', () => {
    expect(parseDuration('12h')).toBe(12 * MS_IN_HOUR);
    expect(parseDuration('1h30m')).toBe(MS_IN_HOUR * 1.5);
    expect(parseDuration('500ms')).toBe(500);
  });

  it('знает единицы крупнее часа', () => {
    expect(parseDuration('3d')).toBe(3 * MS_IN_DAY);
    expect(parseDuration('1w')).toBe(DAYS_IN_WEEK * MS_IN_DAY);
  });

  it('не принимает запись не того формата', () => {
    expect(parseDuration('12 hours')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('12')).toBeNull();
  });
});
