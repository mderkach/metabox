import { z } from 'zod';

/** Действия правила, у которых есть смысл в списке маршрутизации. */
export const RULE_ACTION = {
  Route: 'route',
  Reject: 'reject',
  HijackDns: 'hijack-dns',
  Sniff: 'sniff',
} as const;

/**
 * Отказы формы кодами: текст подставляет `ui`, потому что словарь слайса —
 * его забота, а схема о языке ничего не знает.
 */
export const RULE_EDIT_ERROR = {
  OutboundRequired: 'outboundRequired',
  PortInvalid: 'portInvalid',
} as const;

/**
 * Условия, которые форма правит списком по строке на значение: ими задаются
 * сценарии «домен или адрес — через выход» и «устройство — через выход».
 * Остальных видов сорок с лишним, они правятся текстом узла.
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
 * Что правит форма правила: выход, сеты и ходовые условия. Условия держатся
 * текстом — по значению на строку, — а в узел уходят списком.
 */
export const RuleEditSchema = z.object({
  /** Что делать с трафиком, подошедшим под условия правила */
  action: z.enum([RULE_ACTION.Route, RULE_ACTION.Reject, RULE_ACTION.HijackDns, RULE_ACTION.Sniff]),
  /** Тег outbound'а; обязателен только у `route` */
  outbound: z.string(),
  /** Теги наборов из `route.rule_set`; пустой список — поля в узле нет */
  ruleSet: z.array(z.string()),
  conditions: ConditionsSchema,
});

export type RuleEditModel = z.infer<typeof RuleEditSchema>;

/**
 * Правка, которая ляжет в узел конфига.
 *
 * `outbound` уходит только у `route`: у остальных действий поля в схеме нет, и
 * записанный пустой тег добавил бы в диф правку, которой пользователь не делал.
 * Пустой тег у `route` — ошибка формы, а не повод писать пустую строку.
 *
 * `rule_set` и условия уходят только непустыми: пустой список остался бы в
 * узле полем, которое ничего не проверяет, — снятое условие убирает поле.
 * Порт пишется числом: так его ждёт схема sing-box.
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
