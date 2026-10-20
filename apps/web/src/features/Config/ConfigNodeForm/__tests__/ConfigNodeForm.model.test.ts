import { describe, expect, it } from 'vitest';

import { listToText, packList, parseNumber, parseScalar, SECRET_MASK, secretMaskOf, textToList, UNSET } from '../model';

describe('node form field values', () => {
  it('a multiline field returns values without empty lines and edge spaces', () => {
    expect(textToList(' a.example \n\n b.example ', false)).toEqual(['a.example', 'b.example']);
  });

  it('a single value of a listable field stays a string, an ordinary list stays a list', () => {
    expect(textToList('h2', true)).toBe('h2');
    expect(textToList('h2', false)).toEqual(['h2']);
    expect(packList(['tcp', 'udp'], true)).toEqual(['tcp', 'udp']);
  });

  it('an empty list means "no key"', () => {
    expect(textToList('\n  \n', true)).toBe(UNSET);
    expect(packList([], false)).toBe(UNSET);
  });

  it('a listable string is shown as one line, a list as one value per line', () => {
    expect(listToText('h2')).toBe('h2');
    expect(listToText(['h2', 'http/1.1'])).toBe('h2\nhttp/1.1');
  });

  it('a "string or number" field returns digits as a number, anything else as a string', () => {
    expect(parseScalar('255')).toBe(255);
    expect(parseScalar('0xff')).toBe('0xff');
    expect(parseScalar('  ')).toBe(UNSET);
  });

  it('an empty numeric field means "no key"', () => {
    expect(parseNumber('')).toBe(UNSET);
    expect(parseNumber('443')).toBe(443);
  });
});

describe('secret field mask', () => {
  it.each(['uuid', 'key', 'auth_key', 'api_token', 'api_key', 'mac_key', 'authorization', 'proxy-authorization'])(
    'hides %s whole',
    (key) => {
      expect(secretMaskOf(['tls', key])).toBe(SECRET_MASK.Whole);
    }
  );

  it('matches a key in another case, as the sing-box decoder does', () => {
    expect(secretMaskOf(['UUID'])).toBe(SECRET_MASK.Whole);
    expect(secretMaskOf(['headers', 'Authorization'])).toBe(SECRET_MASK.Whole);
    expect(secretMaskOf(['Private_Key'])).toBe(SECRET_MASK.Whole);
  });

  it('leaves a path to a key file and other keys open', () => {
    expect(secretMaskOf(['tls', 'key_path'])).toBeNull();
    expect(secretMaskOf(['tls', 'certificate'])).toBeNull();
  });
});
