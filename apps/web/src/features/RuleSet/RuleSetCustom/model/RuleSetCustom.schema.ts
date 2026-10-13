import { z } from 'zod';

/**
 * Parsed own list: input lines laid out by sing-box rule conditions. Domains go
 * to `domain_suffix`, a domain and its subdomains, addresses and subnets to
 * `ip_cidr`.
 */
export interface CustomListRules {
  domainSuffixes: string[];
  cidrs: string[];
}

const IPV4_ENTRY = /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/;
const IPV6_ENTRY = /^[0-9a-f:]+(?:\/\d{1,3})?$/i;
/** Domain: ASCII labels separated by dots, no leading hyphen; IDN is entered as punycode. */
const DOMAIN_ENTRY = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i;

/** List lines: empty ones and `#` comments are skipped. */
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
 * Lays lines out by conditions. The second value is the first line that could
 * be assigned to neither a domain nor an address; `null` means all lines were
 * parsed.
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

/** Schema failure codes; the form substitutes the text by them. */
export const RULE_SET_CUSTOM_ERROR = {
  TagRequired: 'tag_required',
  TagTaken: 'tag_taken',
  TagNotFileName: 'tag_not_file_name',
  EntriesRequired: 'entries_required',
  EntryInvalid: 'entry_invalid',
} as const;

/** Where the list lives: a node in the config itself or a file next to it. */
export const LIST_STORAGE = {
  Inline: 'inline',
  File: 'file',
} as const;

export type ListStorage = (typeof LIST_STORAGE)[keyof typeof LIST_STORAGE];

/** The file name is built from the list name, so in file mode it is restricted. */
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

/** List file name in the `rule-sets/` subdirectory. */
export function listFileName(tag: string): string {
  return `${tag.trim()}.json`;
}

/**
 * `route.rule_set` node of type `inline`: the rules are in the config itself,
 * and the list gets check, write, history and rollback from the Apply protocol
 * for free. An empty condition is not written to the node.
 */
export function toInlineRuleSet(model: RuleSetCustomModel): object {
  return { type: 'inline', tag: model.tag.trim(), rules: [toHeadlessRule(model)] };
}

/**
 * `local` node referring to a file in the `rule-sets/` subdirectory: the config
 * stays compact, and the file is written, checked and rolled back by the same
 * apply.
 */
export function toLocalRuleSet(model: RuleSetCustomModel): object {
  return {
    type: 'local',
    tag: model.tag.trim(),
    format: 'source',
    path: `rule-sets/${listFileName(model.tag)}`,
  };
}

/** List file indent: the same as in the config file on the device. */
const FILE_INDENT = 2;

/**
 * List file content in the source format. Version 1 is the oldest the binary
 * reads: list conditions do not need newer ones, and compatibility is wider.
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
