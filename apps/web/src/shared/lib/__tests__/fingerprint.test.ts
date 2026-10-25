import { describe, expect, it } from 'vitest';

import { fingerprint } from '../fingerprint';

describe('fingerprint', () => {
  it('gives the same value for the same text', () => {
    expect(fingerprint('{ "log": { "level": "info" } }')).toBe(fingerprint('{ "log": { "level": "info" } }'));
  });

  it('changes when one character changes', () => {
    expect(fingerprint('{ "level": "info" }')).not.toBe(fingerprint('{ "level": "Info" }'));
  });

  it('is eight hex digits, for an empty text too', () => {
    expect(fingerprint('')).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint('a'.repeat(100_000))).toMatch(/^[0-9a-f]{8}$/);
  });

  it('matches the reference FNV-1a 32-bit values', () => {
    expect(fingerprint('')).toBe('811c9dc5');
    expect(fingerprint('a')).toBe('e40c292c');
    expect(fingerprint('foobar')).toBe('bf9cf968');
  });
});
