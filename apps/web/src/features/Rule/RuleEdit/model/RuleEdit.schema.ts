import { z } from 'zod';

/** Rule actions that make sense in the routing list. */
export const RULE_ACTION = {
  Route: 'route',
  Reject: 'reject',
  HijackDns: 'hijack-dns',
  Sniff: 'sniff',
} as const;

/**
 * Form failures as codes: the `ui` substitutes the text, because the slice
 * dictionary is its concern, and the schema knows nothing about language.
 */
export const RULE_EDIT_ERROR = {
  OutboundRequired: 'outboundRequired',
  PortInvalid: 'portInvalid',
} as const;

/**
 * Conditions that the form edits as a list, one value per line: they set the
 * scenarios "domain or address through an outbound" and "device through an
 * outbound". There are more than forty other kinds, and they are edited as node
 * text.
 */
export const RULE_CONDITION = {
  Domain: 'domain',
  DomainSuffix: 'domain_suffix',
  DomainKeyword: 'domain_keyword',
  IpCidr: 'ip_cidr',
  SourceIpCidr: 'source_ip_cidr',
  Port: 'port',
} as const;

export type RuleCondition = (typeof RULE_CONDITION)[keyof typeof RULE_CONDITION];

export const RULE_CONDITIONS: readonly RuleCondition[] = Object.values(RULE_CONDITION);

const LINE_BREAK = /\r?\n/;

const PORT = /^\d{1,5}$/;

const MAX_PORT = 65_535;

export function conditionLines(text: string): string[] {
  return text
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function nonEmpty<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

function isPort(line: string): boolean {
  return PORT.test(line) && Number(line) <= MAX_PORT;
}

const ConditionsSchema = z.object({
  [RULE_CONDITION.Domain]: z.string(),
  [RULE_CONDITION.DomainSuffix]: z.string(),
  [RULE_CONDITION.DomainKeyword]: z.string(),
  [RULE_CONDITION.IpCidr]: z.string(),
  [RULE_CONDITION.SourceIpCidr]: z.string(),
  [RULE_CONDITION.Port]: z.string(),
});

/**
 * What the rule form edits: the outbound, sets and common conditions.
 * Conditions are held as text, one value per line, and go into the node as a
 * list.
 */
export const RuleEditSchema = z.object({
  /** What to do with traffic that matched the rule conditions */
  action: z.enum([RULE_ACTION.Route, RULE_ACTION.Reject, RULE_ACTION.HijackDns, RULE_ACTION.Sniff]),
  /** Outbound tag; required only for `route` */
  outbound: z.string(),
  /** Set tags from `route.rule_set`; an empty list means no field in the node */
  ruleSet: z.array(z.string()),
  conditions: ConditionsSchema,
});

export type RuleEditModel = z.infer<typeof RuleEditSchema>;

/**
 * The edit that will go into the config node.
 *
 * `outbound` goes only for `route`: other actions have no such field in the
 * schema, and a written empty tag would add an edit to the diff that the user
 * did not make. An empty tag for `route` is a form error, not a reason to write
 * an empty string.
 *
 * `rule_set` and conditions go only when non-empty: an empty list would stay in
 * the node as a field that checks nothing, and a removed condition removes the
 * field. The port is written as a number: that is how the sing-box schema
 * expects it.
 */
export const RuleEditAdapterSchema = RuleEditSchema.refine(
  (data) => data.action !== RULE_ACTION.Route || data.outbound.length > 0,
  { path: ['outbound'], message: RULE_EDIT_ERROR.OutboundRequired }
)
  .refine((data) => conditionLines(data.conditions.port).every(isPort), {
    path: ['conditions', RULE_CONDITION.Port],
    message: RULE_EDIT_ERROR.PortInvalid,
  })
  .transform((data) => ({
    action: data.action,
    ...(data.action === RULE_ACTION.Route && { outbound: data.outbound }),
    ...(data.ruleSet.length > 0 && { rule_set: data.ruleSet }),
    conditions: {
      [RULE_CONDITION.Domain]: nonEmpty(conditionLines(data.conditions.domain)),
      [RULE_CONDITION.DomainSuffix]: nonEmpty(conditionLines(data.conditions.domain_suffix)),
      [RULE_CONDITION.DomainKeyword]: nonEmpty(conditionLines(data.conditions.domain_keyword)),
      [RULE_CONDITION.IpCidr]: nonEmpty(conditionLines(data.conditions.ip_cidr)),
      [RULE_CONDITION.SourceIpCidr]: nonEmpty(conditionLines(data.conditions.source_ip_cidr)),
      [RULE_CONDITION.Port]: nonEmpty(conditionLines(data.conditions.port).map(Number)),
    },
  }));

export type RuleEditPatch = z.infer<typeof RuleEditAdapterSchema>;
