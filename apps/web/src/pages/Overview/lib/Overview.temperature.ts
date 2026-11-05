import { type SystemStat } from '@entities/Daemon';

const DEGREE_PRECISION = 1;

const LOAD_PRECISION = 2;

export function formatLoad(value: number): string {
  return value.toFixed(LOAD_PRECISION);
}

export function formatCelsius(value: number): string {
  return `${value.toFixed(DEGREE_PRECISION)} °C`;
}

export function toTemperature(
  system: SystemStat | null,
  hottest: SystemStat['thermal'][number] | undefined
): string | null {
  if (system === null) {
    return null;
  }

  return hottest === undefined ? '—' : formatCelsius(hottest.celsius);
}
