import type { JSONPath } from 'jsonc-parser';
import type { z } from 'zod';

import { DNSOptionsSchema, RouteOptionsSchema } from '@shared/api/generated';

import { CONFIG_SECTION, findValue } from './Config.model';

/**
 * Секции, у которых, кроме списков, есть свои скалярные поля: `route.final`,
 * `dns.strategy` и соседние. Списки правят свои экраны — правила, сеты,
 * серверы, — поэтому из формы секции они исключены.
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

/** Схема скаляров секции: сгенерированная схема секции без её списков. */
export function sectionSettingsSchema(section: SettingsSection): z.core.$ZodType {
  return SETTINGS_SECTIONS[section].schema;
}

/**
 * Скаляры секции как есть, из текста, без списков. Секции нет в файле —
 * пустой объект: форма её создаст первым же заполненным полем. `null` — на
 * месте секции не объект, править формой нечего.
 *
 * Незнакомый ключ не отбрасывается: по нему схема узнаёт, что секцию форма
 * не покрывает.
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

/** Скаляры секции приняты схемой: форма их не потеряет. */
export function isSectionSettingsRecognized(section: SettingsSection, settings: unknown): boolean {
  return SETTINGS_SECTIONS[section].schema.safeParse(settings).success;
}
