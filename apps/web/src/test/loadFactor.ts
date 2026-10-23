/**
 * Cost of the reference workload on an idle machine, measured 2026-10-24 on a MacBook
 * (jsdom, Vitest 4, Node 24.21.0).
 */
const IDLE_REFERENCE_MS = 6;
const REFERENCE_SIZE = 20_000;
const REFERENCE_RUNS = 7;

function referenceWorkload(): number {
  const start = performance.now();
  const items = Array.from({ length: REFERENCE_SIZE }, (_, index) => ({
    key: `k${(index * 7919) % REFERENCE_SIZE}`,
    index,
  }));

  items.sort((left, right) => left.key.localeCompare(right.key));

  return performance.now() - start;
}

/**
 * How many times slower than idle this process runs right now: the median of several runs of a fixed
 * CPU workload against its idle cost. The median, not the best run: under load a quiet slice
 * lets one run through at idle speed, while the measured code gets the loaded ones.
 * Never below 1: a faster machine does not tighten a budget.
 */
export function loadFactor(): number {
  const runs = Array.from({ length: REFERENCE_RUNS }, referenceWorkload).sort((left, right) => left - right);

  return Math.max(1, runs[Math.floor(runs.length / 2)] / IDLE_REFERENCE_MS);
}

/**
 * Budget scaled by the load of the moment. Called after the measurement: a neighbor that took the CPU
 * during it is still there, and a calm machine gives a factor of 1.
 */
export function scaledBudget(idleBudgetMs: number): number {
  return idleBudgetMs * loadFactor();
}
