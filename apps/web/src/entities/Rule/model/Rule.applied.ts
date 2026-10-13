/**
 * Index of the same rule in the applied config for each draft rule; `null`
 * means the rule is new or changed. The whole node is compared: a rule the user
 * moved without touching stays the same rule, and an edit of any field makes it
 * a different one.
 *
 * Identical nodes are matched in order: the second draft duplicate gets the
 * second applied config duplicate, not the first again.
 */
export function toAppliedIndices(draft: readonly unknown[], applied: readonly unknown[]): (number | null)[] {
  const free = new Map<string, number[]>();

  for (const [index, node] of applied.entries()) {
    const key = JSON.stringify(node);
    free.set(key, [...(free.get(key) ?? []), index]);
  }

  return draft.map((node) => free.get(JSON.stringify(node))?.shift() ?? null);
}
