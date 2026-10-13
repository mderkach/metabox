import { describe, expect, it } from 'vitest';

import { SCHEMA_DRIFT, SCHEMA_VERSION, schemaDrift } from '../model/Daemon.version';

describe('schemaDrift', () => {
  it('sees no mismatch for the same version without a leading v', () => {
    expect(schemaDrift(SCHEMA_VERSION)).toBe(SCHEMA_DRIFT.None);
  });

  it('sees no mismatch for the same version with a leading v', () => {
    expect(schemaDrift(`v${SCHEMA_VERSION}`)).toBe(SCHEMA_DRIFT.None);
  });

  it('sees a binary older than the schema', () => {
    expect(schemaDrift('1.13.18-extended-2.6.5')).toBe(SCHEMA_DRIFT.Older);
  });

  it('sees a binary newer than the schema by the fork version', () => {
    expect(schemaDrift(`${SCHEMA_VERSION}.1`)).toBe(SCHEMA_DRIFT.Newer);
    expect(schemaDrift('99.0.0-extended-0.0.1')).toBe(SCHEMA_DRIFT.Newer);
  });

  it('does not count an unread version as a mismatch', () => {
    expect(schemaDrift(undefined)).toBe(SCHEMA_DRIFT.None);
  });
});
