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
} as const;

/**
 * Что правит форма правила: выход и сеты. Из условий сюда входят только сеты —
 * они ссылаются на наборы документа, и выбрать их можно из списка. Остальных
 * условий сорок с лишним видов, и до авторендерера они правятся текстом узла.
 */
export const RuleEditSchema = z.object({
  /** Что делать с трафиком, подошедшим под условия правила */
  action: z.enum([RULE_ACTION.Route, RULE_ACTION.Reject, RULE_ACTION.HijackDns, RULE_ACTION.Sniff]),
  /** Тег outbound'а; обязателен только у `route` */
  outbound: z.string(),
  /** Теги наборов из `route.rule_set`; пустой список — поля в узле нет */
  ruleSet: z.array(z.string()),
});

export type RuleEditModel = z.infer<typeof RuleEditSchema>;

/**
 * Правка, которая ляжет в узел конфига.
 *
 * `outbound` уходит только у `route`: у остальных действий поля в схеме нет, и
 * записанный пустой тег добавил бы в диф правку, которой пользователь не делал.
 * Пустой тег у `route` — ошибка формы, а не повод писать пустую строку.
 *
 * `rule_set` уходит только непустым: пустой список остался бы в узле полем,
 * которое ни на что не ссылается, — снятые сеты убирают поле целиком.
 */
export const RuleEditAdapterSchema = RuleEditSchema.refine(
  (data) => data.action !== RULE_ACTION.Route || data.outbound.length > 0,
  { path: ['outbound'], message: RULE_EDIT_ERROR.OutboundRequired }
).transform((data) => ({
  action: data.action,
  ...(data.action === RULE_ACTION.Route && { outbound: data.outbound }),
  ...(data.ruleSet.length > 0 && { rule_set: data.ruleSet }),
}));

export type RuleEditPatch = z.infer<typeof RuleEditAdapterSchema>;
