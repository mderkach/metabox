export interface CountedGroup {
  value: string;
  count: number;
}

/**
 * Значения с числом вхождений, частые первыми; при равенстве — по алфавиту.
 * Порядок задан целиком, потому что на нём стоит порядок фасетов на экране.
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
