import { describe, expect, it } from 'vitest';

import { SCHEMA_DRIFT, SCHEMA_VERSION, schemaDrift } from '../model/Daemon.version';

describe('schemaDrift', () => {
  it('не видит расхождения у той же версии без ведущей v', () => {
    expect(schemaDrift(SCHEMA_VERSION)).toBe(SCHEMA_DRIFT.None);
  });

  it('не видит расхождения у той же версии с ведущей v', () => {
    expect(schemaDrift(`v${SCHEMA_VERSION}`)).toBe(SCHEMA_DRIFT.None);
  });

  it('видит бинарь старше схемы', () => {
    expect(schemaDrift('1.13.18-extended-2.6.5')).toBe(SCHEMA_DRIFT.Older);
  });

  it('видит бинарь новее схемы по версии форка', () => {
    expect(schemaDrift(`${SCHEMA_VERSION}.1`)).toBe(SCHEMA_DRIFT.Newer);
    expect(schemaDrift('99.0.0-extended-0.0.1')).toBe(SCHEMA_DRIFT.Newer);
  });

  it('не считает расхождением непрочитанную версию', () => {
    expect(schemaDrift(undefined)).toBe(SCHEMA_DRIFT.None);
  });
});
