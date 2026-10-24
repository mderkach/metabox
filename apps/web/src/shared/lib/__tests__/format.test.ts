import { stripWordJoiners } from '@test/wordJoiner';
import { describe, expect, it } from 'vitest';

import { formatAge, formatBytes, formatDate, formatDateTime, formatRate } from '../format';

describe('connection age', () => {
  it('in the first minute counts in seconds', () => {
    expect(formatAge(0)).toBe('0 с');
    expect(formatAge(59.9)).toBe('59 с');
  });

  it('does not show a negative age: the browser and device clocks diverge', () => {
    expect(formatAge(-3)).toBe('0 с');
  });

  it('beyond a minute rounds down to minutes, hours and days', () => {
    expect(formatAge(60)).toBe('1 мин');
    expect(formatAge(3599)).toBe('59 мин');
    expect(formatAge(3600)).toBe('1 ч');
    expect(formatAge(86_399)).toBe('23 ч');
    expect(formatAge(86_400)).toBe('1 д');
  });
});

describe('rate', () => {
  it('joins the unit to the slash so it does not break after it', () => {
    expect(formatRate(2048)).toContain('/\u2060с');
  });

  it('reads as bytes per second once the joiner is dropped', () => {
    expect(stripWordJoiners(formatRate(2048))).toBe(`${formatBytes(2048)}/с`);
  });
});

describe('date', () => {
  const at = new Date(2025, 8, 11, 17, 13, 20);

  it('prints the date in digits in the order of the interface language', () => {
    expect(formatDate(at)).toBe('11.09.2025');
  });

  it('with time prints the same date and time to the minute', () => {
    expect(formatDateTime(at)).toBe('11.09.2025, 17:13');
  });
});
