/** Numbers in ascending order with runs folded: `6, 18–31`. */
export function toRanges(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].toSorted((left, right) => left - right);
  const runs: [number, number][] = [];

  for (const value of sorted) {
    const last = runs.at(-1);

    if (last !== undefined && value === last[1] + 1) {
      last[1] = value;
    } else {
      runs.push([value, value]);
    }
  }

  return runs.map(([from, to]) => (from === to ? String(from) : `${String(from)}–${String(to)}`)).join(', ');
}
