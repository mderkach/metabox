import type { JSONPath } from 'jsonc-parser';
import type { z } from 'zod';

import { DNSOptionsSchema, RouteOptionsSchema } from '@shared/api/generated';

import { CONFIG_SECTION, findValue } from './Config.model';

/**
 * Sections that have their own scalar fields besides lists: `route.final`,
 * `dns.strategy` and the like. Lists are edited by their own screens (rules,
 * sets, servers), so they are excluded from the section form.
 */
const SETTINGS_SECTIONS = {
  [CONFIG_SECTION.Route]: {
    path: ['route'],
    schema: RouteOptionsSchema.omit({ rules: true, rule_set: true }),
    lists: ['rules', 'rule_set'],
  },
  [CONFIG_SECTION.Dns]: {
    path: ['dns'],
    schema: DNSOptionsSchema.omit({ servers: true, rules: true }),
    lists: ['servers', 'rules'],
  },
} as const satisfies Record<string, { path: JSONPath; schema: z.core.$ZodType; lists: readonly string[] }>;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

export function isSettingsSection(section: string): section is SettingsSection {
  return section in SETTINGS_SECTIONS;
}

export function sectionSettingsPath(section: SettingsSection): JSONPath {
  return SETTINGS_SECTIONS[section].path;
}

/** Section scalar schema: the generated section schema without its lists. */
export function sectionSettingsSchema(section: SettingsSection): z.core.$ZodType {
  return SETTINGS_SECTIONS[section].schema;
}

/**
 * Section scalars as is, from the text, without lists. If the section is not in
 * the file, an empty object: the form will create it with the first filled
 * field. `null` means the section is not an object, and there is nothing to
 * edit with a form.
 *
 * An unfamiliar key is not dropped: the schema uses it to learn that the form
 * does not cover the section.
 */
export function readSectionSettings(text: string, section: SettingsSection): Record<string, unknown> | null {
  const value = findValue(text, SETTINGS_SECTIONS[section].path);

  if (value === undefined) {
    return {};
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const lists: readonly string[] = SETTINGS_SECTIONS[section].lists;

  return Object.fromEntries(Object.entries(value).filter(([key]) => !lists.includes(key)));
}

/** Section scalars are accepted by the schema: the form will not lose them. */
export function isSectionSettingsRecognized(section: SettingsSection, settings: unknown): boolean {
  return SETTINGS_SECTIONS[section].schema.safeParse(settings).success;
}
