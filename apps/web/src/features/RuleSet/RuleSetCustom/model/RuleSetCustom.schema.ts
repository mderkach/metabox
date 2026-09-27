import { z } from 'zod';

/**
 * Разобранный свой список: строки ввода, разложенные по условиям правила
 * sing-box. Домены уходят в `domain_suffix` — домен и его поддомены, — адреса
 * и подсети в `ip_cidr`.
 */
export interface CustomListRules {
  domainSuffixes: string[];
  cidrs: string[];
}

const IPV4_ENTRY = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/;
const IPV6_ENTRY = /^[0-9a-f:]+(?:\/\d{1,3})?$/i;
/** Домен: ASCII-метки через точку, без ведущего дефиса; IDN вводится punycode. */
const DOMAIN_ENTRY = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i;

/** Строки списка: пустые и комментарии `#` пропускаются. */
export function listEntries(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function classifyEntry(entry: string): keyof CustomListRules | null {
  if (IPV4_ENTRY.test(entry) || (entry.includes(':') && IPV6_ENTRY.test(entry))) {
    return 'cidrs';
  }

  if (DOMAIN_ENTRY.test(entry)) {
    return 'domainSuffixes';
  }

  return null;
}

/**
 * Раскладывает строки по условиям. Вторым значением — первая строка, которую
 * не удалось отнести ни к домену, ни к адресу; `null` — все строки разобраны.
 */
export function parseListEntries(text: string): { rules: CustomListRules; invalid: string | null } {
  const rules: CustomListRules = { domainSuffixes: [], cidrs: [] };

  for (const entry of listEntries(text)) {
    const kind = classifyEntry(entry);

    if (kind === null) {
      return { rules, invalid: entry };
    }

    rules[kind].push(entry);
  }

  return { rules, invalid: null };
}

/** Коды отказов схемы; текст по ним подставляет форма. */
export const RULE_SET_CUSTOM_ERROR = {
  TagRequired: 'tag_required',
  TagTaken: 'tag_taken',
  TagNotFileName: 'tag_not_file_name',
  EntriesRequired: 'entries_required',
  EntryInvalid: 'entry_invalid',
} as const;

/** Где живёт список: узлом в самом конфиге или файлом рядом с ним. */
export const LIST_STORAGE = {
  Inline: 'inline',
  File: 'file',
} as const;

export type ListStorage = (typeof LIST_STORAGE)[keyof typeof LIST_STORAGE];

/** Имя файла строится из имени списка, поэтому в режиме файла оно ограничено. */
const FILE_TAG = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface RuleSetCustomModel {
  tag: string;
  storage: ListStorage;
  entries: string;
}

export function ruleSetCustomDefaults(): RuleSetCustomModel {
  return { tag: '', storage: LIST_STORAGE.Inline, entries: '' };
}

export function makeRuleSetCustomSchema(takenTags: readonly string[]) {
  const taken = new Set(takenTags);

  return z
    .object({
      tag: z
        .string()
        .trim()
        .min(1, RULE_SET_CUSTOM_ERROR.TagRequired)
        .refine((tag) => !taken.has(tag), RULE_SET_CUSTOM_ERROR.TagTaken),
      storage: z.enum([LIST_STORAGE.Inline, LIST_STORAGE.File]),
      entries: z
        .string()
        .refine((text) => listEntries(text).length > 0, RULE_SET_CUSTOM_ERROR.EntriesRequired)
        .refine((text) => parseListEntries(text).invalid === null, RULE_SET_CUSTOM_ERROR.EntryInvalid),
    })
    .superRefine((model, ctx) => {
      if (model.storage === LIST_STORAGE.File && !FILE_TAG.test(model.tag.trim())) {
        ctx.addIssue({ code: 'custom', path: ['tag'], message: RULE_SET_CUSTOM_ERROR.TagNotFileName });
      }
    });
}

/** Имя файла списка в подкаталоге `rule-sets/`. */
export function listFileName(tag: string): string {
  return `${tag.trim()}.json`;
}

/**
 * Узел `route.rule_set` с типом `inline`: правила лежат в самом конфиге, и
 * проверку, запись, историю и откат список получает протоколом Apply даром.
 * Пустое условие в узел не пишется.
 */
export function toInlineRuleSet(model: RuleSetCustomModel): object {
  return { type: 'inline', tag: model.tag.trim(), rules: [toHeadlessRule(model)] };
}

/**
 * Узел `local` со ссылкой на файл в подкаталоге `rule-sets/`: конфиг остаётся
 * компактным, а файл пишется, проверяется и откатывается тем же применением.
 */
export function toLocalRuleSet(model: RuleSetCustomModel): object {
  return {
    type: 'local',
    tag: model.tag.trim(),
    format: 'source',
    path: `rule-sets/${listFileName(model.tag)}`,
  };
}

/** Отступ файла списка: тот же, что у файла конфига на устройстве. */
const FILE_INDENT = 2;

/**
 * Содержимое файла списка в формате source. Версия 1 — самая старая из
 * читаемых бинарём: условиям списка новее не нужно, а совместимость шире.
 */
export function toListFileContent(model: RuleSetCustomModel): string {
  return `${JSON.stringify({ version: 1, rules: [toHeadlessRule(model)] }, null, FILE_INDENT)}\n`;
}

function toHeadlessRule(model: RuleSetCustomModel): Record<string, string[]> {
  const { rules } = parseListEntries(model.entries);
  const rule: Record<string, string[]> = {};

  if (rules.domainSuffixes.length > 0) {
    rule.domain_suffix = rules.domainSuffixes;
  }

  if (rules.cidrs.length > 0) {
    rule.ip_cidr = rules.cidrs;
  }

  return rule;
}
