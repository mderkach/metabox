import { describe, expect, it } from 'vitest';

import { formatUpdateInterval } from '../ui/RuleSetInterval';

describe('update interval in words', () => {
  it('names a day and a week by name', () => {
    expect(formatUpdateInterval('24h')).toBe('раз в сутки');
    expect(formatUpdateInterval('1d')).toBe('раз в сутки');
    expect(formatUpdateInterval('1w')).toBe('раз в неделю');
  });

  it('counts the rest in the largest whole unit', () => {
    expect(formatUpdateInterval('12h')).toBe('каждые 12 ч');
    expect(formatUpdateInterval('3d')).toBe('каждые 3 дня');
    expect(formatUpdateInterval('90m')).toBe('каждые 90 мин');
  });

  it('returns the unparsed as is', () => {
    expect(formatUpdateInterval('12 hours')).toBe('12 hours');
    expect(formatUpdateInterval('0s')).toBe('0s');
  });
});
