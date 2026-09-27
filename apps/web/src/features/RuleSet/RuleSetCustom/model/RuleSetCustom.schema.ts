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
  EntriesRequired: 'entries_required',
  EntryInvalid: 'entry_invalid',
} as const;

export interface RuleSetCustomModel {
  tag: string;
  entries: string;
}

export function ruleSetCustomDefaults(): RuleSetCustomModel {
  return { tag: '', entries: '' };
}

export function makeRuleSetCustomSchema(takenTags: readonly string[]) {
  const taken = new Set(takenTags);

  return z.object({
    tag: z
      .string()
      .trim()
      .min(1, RULE_SET_CUSTOM_ERROR.TagRequired)
      .refine((tag) => !taken.has(tag), RULE_SET_CUSTOM_ERROR.TagTaken),
    entries: z
      .string()
      .refine((text) => listEntries(text).length > 0, RULE_SET_CUSTOM_ERROR.EntriesRequired)
      .refine((text) => parseListEntries(text).invalid === null, RULE_SET_CUSTOM_ERROR.EntryInvalid),
  });
}

/**
 * Узел `route.rule_set` с типом `inline`: правила лежат в самом конфиге, и
 * проверку, запись, историю и откат список получает протоколом Apply даром.
 * Пустое условие в узел не пишется.
 */
export function toInlineRuleSet(model: RuleSetCustomModel): object {
  const { rules } = parseListEntries(model.entries);
  const rule: Record<string, string[]> = {};

  if (rules.domainSuffixes.length > 0) {
    rule.domain_suffix = rules.domainSuffixes;
  }

  if (rules.cidrs.length > 0) {
    rule.ip_cidr = rules.cidrs;
  }

  return { type: 'inline', tag: model.tag.trim(), rules: [rule] };
}
