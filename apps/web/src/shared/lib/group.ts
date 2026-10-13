export interface CountedGroup {
  value: string;
  count: number;
}

/**
 * Values with occurrence counts, frequent first; ties broken alphabetically.
 * The order is fully defined because the facet order on screen rests on it.
 */
export function countGroups<T>(items: T[], toValue: (item: T) => string): CountedGroup[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    const value = toValue(item);

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}
