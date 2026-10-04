import { ROUTE_KIND, toOutboundKind, type RouteKind } from '@entities/Connection';
import { RULE_TARGET, type RuleTargetKind } from '@entities/Rule';

/** Действие — не выход трафика, а вмешательство в него: свой нейтральный тон. */
const ACTION_TONE = 'text-route-neutral';
const PROXY_TONE = 'text-route-proxy';

/** Тон по судьбе пакета, выведенной из типа аутбаунда. */
const KIND_TONES: Readonly<Record<RouteKind, string>> = {
  [ROUTE_KIND.Direct]: 'text-route-direct',
  [ROUTE_KIND.Proxy]: PROXY_TONE,
  [ROUTE_KIND.Block]: 'text-route-block',
  [ROUTE_KIND.Dns]: 'text-route-dns',
  [ROUTE_KIND.Other]: ACTION_TONE,
};

/**
 * Запасная таблица «подстрока → тон», а не цепочка условий: для действия и для
 * тега, которого в конфиге нет, тона по типу не будет, и совпадение ищется по
 * общепринятым именам.
 */
const OUTBOUND_TONES = [
  { match: 'direct', tone: 'text-route-direct' },
  { match: 'block', tone: 'text-route-block' },
  { match: 'reject', tone: 'text-route-block' },
  { match: 'dns', tone: 'text-route-dns' },
] as const;

/**
 * Цвет выхода правила. Первичен тип аутбаунда: тег пишет пользователь, и
 * `directional` типа `vless` — прокси, а не прямой выход.
 */
export function toTargetTone(kind: RuleTargetKind, target: string, outboundTypes: ReadonlyMap<string, string>): string {
  const typed = kind === RULE_TARGET.Outbound ? toOutboundKind(target, outboundTypes) : null;

  if (typed !== null) {
    return KIND_TONES[typed];
  }

  const lower = target.toLowerCase();
  const known = OUTBOUND_TONES.find((entry) => lower.includes(entry.match))?.tone;

  if (known !== undefined) {
    return known;
  }

  return kind === RULE_TARGET.Outbound ? PROXY_TONE : ACTION_TONE;
}
