/**
 * Индекс того же правила в применённом конфиге для каждого правила черновика;
 * `null` — правило новое или изменено. Сравнивается узел целиком: правило,
 * которое пользователь переставил, не тронув, остаётся тем же правилом, а
 * правка любого поля делает его другим.
 *
 * Одинаковые узлы разбираются по порядку: второй дубль черновика получает
 * второй дубль применённого конфига, а не первый повторно.
 */
export function toAppliedIndices(draft: readonly unknown[], applied: readonly unknown[]): (number | null)[] {
  const free = new Map<string, number[]>();

  for (const [index, node] of applied.entries()) {
    const key = JSON.stringify(node);
    free.set(key, [...(free.get(key) ?? []), index]);
  }

  return draft.map((node) => free.get(JSON.stringify(node))?.shift() ?? null);
}
