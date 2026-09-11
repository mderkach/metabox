import { z } from 'zod';

/** Действия правила, у которых есть смысл в списке маршрутизации. */
export const RULE_ACTION = {
  Route: 'route',
  Reject: 'reject',
  HijackDns: 'hijack-dns',
  Sniff: 'sniff',
} as const;

/**
 * Что правит форма исхода. Условия сюда не входят: их сорок с лишним видов,
 * и до авторендерера они правятся текстом узла.
 */
export const RuleEditSchema = z.object({
  /** Что делать с трафиком, подошедшим под условия правила */
  action: z.enum([RULE_ACTION.Route, RULE_ACTION.Reject, RULE_ACTION.HijackDns, RULE_ACTION.Sniff]),
  /** Тег outbound'а; обязателен только у `route` */
  outbound: z.string(),
});

export type RuleEditModel = z.infer<typeof RuleEditSchema>;

/**
 * Правка, которая ляжет в узел конфига.
 *
 * `outbound` уходит только у `route`: у остальных действий поля в схеме нет, и
 * записанный пустой тег добавил бы в диф правку, которой пользователь не делал
 * (AC-2). Пустой тег у `route` — ошибка формы, а не повод писать пустую строку.
 */
export const RuleEditAdapterSchema = RuleEditSchema.refine(
  (data) => data.action !== RULE_ACTION.Route || data.outbound.length > 0,
  { path: ['outbound'], message: 'rule.outbound.required' }
).transform((data) => ({
  action: data.action,
  ...(data.action === RULE_ACTION.Route && { outbound: data.outbound }),
}));

export type RuleEditPatch = z.infer<typeof RuleEditAdapterSchema>;
