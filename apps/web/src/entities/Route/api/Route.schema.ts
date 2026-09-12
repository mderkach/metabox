import { z } from 'zod';

/**
 * Формы ответа `GET /api/connections/{id}/route` — `route.Explanation` демона.
 * Схемы описывают то, что пришло по проводу, и ничего не переводят: перевод и
 * решение об отказе живут в `model/Route.adapter.ts`.
 */
export const RouteMatchSchema = z.object({
  origin: z.string(),
  kind: z.string(),
  /** Индекс узла `route.rules`, считая с нуля. Отсутствует у `final` и `unknown`. */
  index: z.int().optional(),
  conditions: z.string().optional(),
  action: z.string().optional(),
  reason: z.string().optional(),
});

export const RouteChainSchema = z.object({
  origin: z.string(),
  nodes: z.array(z.string()).optional(),
});

export const RouteRuleSchema = z.object({
  origin: z.string(),
  index: z.int(),
  type: z.string(),
  conditions: z.string(),
  action: z.string(),
});

export const RouteExplanationSchema = z.object({
  connection_id: z.string(),
  match: RouteMatchSchema,
  chain: RouteChainSchema,
  rules: z.array(RouteRuleSchema).optional(),
});

export type RouteExplanationWire = z.infer<typeof RouteExplanationSchema>;
