import { RULE_TARGET, type RuleTargetKind } from '@entities/Rule';

/**
 * Цвет выхода правила. Таблица «подстрока → тон», а не цепочка условий: тег
 * аутбаунда пишет пользователь, и совпадение ищется по общепринятым именам.
 */
const OUTBOUND_TONES = [
  { match: 'direct', tone: 'text-route-direct' },
  { match: 'block', tone: 'text-route-block' },
  { match: 'reject', tone: 'text-route-block' },
  { match: 'dns', tone: 'text-route-dns' },
] as const;

/** Действие — не выход трафика, а вмешательство в него: свой нейтральный тон. */
const ACTION_TONE = 'text-route-neutral';
const PROXY_TONE = 'text-route-proxy';

export function toTargetTone(kind: RuleTargetKind, target: string): string {
  const lower = target.toLowerCase();
  const known = OUTBOUND_TONES.find((entry) => lower.includes(entry.match))?.tone;

  if (known !== undefined) {
    return known;
  }

  return kind === RULE_TARGET.Outbound ? PROXY_TONE : ACTION_TONE;
}
