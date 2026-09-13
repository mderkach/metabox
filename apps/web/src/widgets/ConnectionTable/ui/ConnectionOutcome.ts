/**
 * Цвет исхода. Таблица «подстрока → тон», а не цепочка условий: исход приходит
 * строкой рантайма (`route(direct)`, `hijack-dns`, `sniff`), и новый вид узла
 * добавляется сюда записью.
 *
 * Порядок значим — проверка идёт до первого совпадения, поэтому `block` стоит
 * раньше общего `route(`.
 */
const OUTCOME_TONES = [
  { match: 'direct', tone: 'text-route-direct' },
  { match: 'block', tone: 'text-route-block' },
  { match: 'reject', tone: 'text-route-block' },
  { match: 'dns', tone: 'text-route-dns' },
  { match: 'route(', tone: 'text-route-proxy' },
] as const;

const NEUTRAL_TONE = 'text-route-neutral';

export function toOutcomeTone(outcome: string): string {
  const lower = outcome.toLowerCase();

  return OUTCOME_TONES.find((entry) => lower.includes(entry.match))?.tone ?? NEUTRAL_TONE;
}
