import { describe, expect, it } from 'vitest';

import { toFieldPlan } from '@shared/lib/schemaShape';

import { CONFIG_SECTION } from '../model/Config.model';
import {
  isSectionSettingsRecognized,
  isSettingsSection,
  readSectionSettings,
  sectionSettingsPath,
  sectionSettingsSchema,
} from '../model/Config.settings';

const TEXT = `{
  "dns": { "servers": [{ "type": "local" }], "rules": [], "final": "local" },
  "route": { "rules": [], "rule_set": [], "final": "direct", "default_mark": 1 }
}`;

describe('section scalars', () => {
  it('recognizes sections with scalars', () => {
    expect(isSettingsSection(CONFIG_SECTION.Route)).toBe(true);
    expect(isSettingsSection(CONFIG_SECTION.Dns)).toBe(true);
    expect(isSettingsSection(CONFIG_SECTION.Log)).toBe(false);
    expect(sectionSettingsPath(CONFIG_SECTION.Route)).toEqual(['route']);
  });

  it('reads scalars without lists', () => {
    expect(readSectionSettings(TEXT, CONFIG_SECTION.Route)).toEqual({ final: 'direct', default_mark: 1 });
    expect(readSectionSettings(TEXT, CONFIG_SECTION.Dns)).toEqual({ final: 'local' });
  });

  it('returns an empty object for a missing section and null for a non-object', () => {
    expect(readSectionSettings('{}', CONFIG_SECTION.Dns)).toEqual({});
    expect(readSectionSettings('{ "dns": [] }', CONFIG_SECTION.Dns)).toBeNull();
  });

  it('the form schema has no section lists', () => {
    const route = toFieldPlan(sectionSettingsSchema(CONFIG_SECTION.Route)).map((field) => field.key);
    const dns = toFieldPlan(sectionSettingsSchema(CONFIG_SECTION.Dns)).map((field) => field.key);

    expect(route).toContain('final');
    expect(route).not.toContain('rules');
    expect(route).not.toContain('rule_set');
    expect(dns).toContain('strategy');
    expect(dns).not.toContain('servers');
    expect(dns).not.toContain('rules');
  });

  it('an unknown key makes the scalars unrecognized', () => {
    expect(isSectionSettingsRecognized(CONFIG_SECTION.Route, { final: 'direct' })).toBe(true);
    expect(isSectionSettingsRecognized(CONFIG_SECTION.Route, { final: 'direct', unknown_key: 1 })).toBe(false);
  });
});
