import type { JSONPath } from 'jsonc-parser';
import type { z } from 'zod';

import { DNSOptionsSchema, ExperimentalOptionsSchema, RouteOptionsSchema } from '@shared/api/generated';

import { CONFIG_SECTION, findValue } from './Config.model';

/**
 * Sections whose own fields open as a form: scalars beside lists
 * (`route.final`, `dns.strategy`) or a whole object section (`experimental`).
 * Lists are edited by their own screens (rules, sets, servers), so they are
 * excluded from the section form.
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
  [CONFIG_SECTION.Experimental]: {
    path: ['experimental'],
    schema: ExperimentalOptionsSchema,
    lists: [],
  },
} as const satisfies Record<string, { path: JSONPath; schema: z.core.$ZodType; lists: readonly string[] }>;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

/** Sections whose own fields sit beside their lists: the form is a card above the list. */
export type ListSettingsSection = {
  [K in SettingsSection]: (typeof SETTINGS_SECTIONS)[K]['lists'] extends readonly [] ? never : K;
}[SettingsSection];

export function isSettingsSection(section: string): section is SettingsSection {
  return section in SETTINGS_SECTIONS;
}

export function isListSettingsSection(section: SettingsSection): section is ListSettingsSection {
  return SETTINGS_SECTIONS[section].lists.length > 0;
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
  return toSectionSettings(section, findValue(text, SETTINGS_SECTIONS[section].path));
}

/** The same as `readSectionSettings`, over a section value already read from the text. */
export function toSectionSettings(section: SettingsSection, value: unknown): Record<string, unknown> | null {
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
