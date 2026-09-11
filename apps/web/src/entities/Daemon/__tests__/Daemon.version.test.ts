import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, matchesSchemaVersion } from '../model/Daemon.version';

describe('matchesSchemaVersion', () => {
  it('считает совпадением версию бинаря без ведущей v', () => {
    expect(matchesSchemaVersion(SCHEMA_VERSION)).toBe(true);
  });

  it('считает совпадением версию бинаря с ведущей v', () => {
    expect(matchesSchemaVersion(`v${SCHEMA_VERSION}`)).toBe(true);
  });

  it('видит расхождение с версией постарше', () => {
    expect(matchesSchemaVersion('1.13.18-extended-2.6.5')).toBe(false);
  });

  it('не считает расхождением непрочитанную версию', () => {
    expect(matchesSchemaVersion(undefined)).toBe(true);
  });
});
