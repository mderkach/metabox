import { describe, expect, it } from 'vitest';

import { LATENCY_CEILING_MS, LATENCY_LEVEL, toLatencyReading, type ServerLatency } from '../model/Proxy.latency';
import { DELAY_STATE, DELAY_TIMEOUT } from '../model/Proxy.model';

const CURRENT = { at: '2026-01-01T00:00:00Z', delayMS: 180 };
const LATENCY: ServerLatency = {
  current: CURRENT,
  recent: [CURRENT, CURRENT, CURRENT],
  hourly: [],
  usualMS: 120,
  computedUsualMS: 200,
  origin: 'computed',
  level: LATENCY_LEVEL.AboveNorm,
};

describe('toLatencyReading', () => {
  it('uses the current automatic value after reset, before refetch completes', () => {
    expect(toLatencyReading(LATENCY)).toEqual({
      usual: 200,
      level: LATENCY_LEVEL.WithinNorm,
      meter: { delay: 180, delayState: DELAY_STATE.Fast },
    });
  });

  it('keeps the delay neutral when the old reading still carries the removed manual norm', () => {
    const latency = { ...LATENCY, computedUsualMS: null };
    expect(toLatencyReading(latency)).toEqual({
      usual: null,
      level: undefined,
      meter: { delay: 180, delayState: DELAY_STATE.Unknown },
    });
  });

  it('keeps a fresh delay neutral without an automatic norm', () => {
    const latency = { ...LATENCY, usualMS: null, computedUsualMS: null, level: LATENCY_LEVEL.WithinNorm };
    expect(toLatencyReading(latency)).toEqual({
      usual: null,
      level: undefined,
      meter: { delay: 180, delayState: DELAY_STATE.Unknown },
    });
  });

  it('preserves the effective norm and comparison from an older daemon', () => {
    const latency = { ...LATENCY, computedUsualMS: null };
    expect(toLatencyReading(latency, undefined, true)).toMatchObject({
      usual: 120,
      level: LATENCY_LEVEL.AboveNorm,
    });
  });

  it('keeps the delay but withholds a stale warning when the current streak cannot be proven', () => {
    expect(toLatencyReading(LATENCY, 150)).toEqual({
      usual: 150,
      level: undefined,
      meter: { delay: 180, delayState: DELAY_STATE.Unknown },
    });
  });

  it('does not infer a new warning from recent history retained across core processes', () => {
    const latency = {
      ...LATENCY,
      usualMS: 200,
      level: LATENCY_LEVEL.WithinNorm,
    };
    expect(toLatencyReading(latency, 150)).toMatchObject({
      level: undefined,
      meter: { delayState: DELAY_STATE.Unknown },
    });
  });

  it('keeps a known warning when the new norm is lower than the old one', () => {
    expect(toLatencyReading(LATENCY, 100)).toMatchObject({
      usual: 100,
      level: LATENCY_LEVEL.AboveNorm,
      meter: { delayState: DELAY_STATE.Slow },
    });
  });

  it('keeps a known within-norm result when the new norm is higher than the old one', () => {
    const latency = { ...LATENCY, level: LATENCY_LEVEL.WithinNorm };
    expect(toLatencyReading(latency, 150)).toMatchObject({
      usual: 150,
      level: LATENCY_LEVEL.WithinNorm,
      meter: { delayState: DELAY_STATE.Fast },
    });
  });

  it.each([
    {
      level: LATENCY_LEVEL.NoMeasurement,
      current: null,
      delay: null,
      delayState: DELAY_STATE.Unknown,
    },
    {
      level: LATENCY_LEVEL.NoAnswer,
      current: { ...CURRENT, delayMS: null },
      delay: DELAY_TIMEOUT,
      delayState: DELAY_STATE.Failed,
    },
    {
      level: LATENCY_LEVEL.AboveCeiling,
      current: { ...CURRENT, delayMS: LATENCY_CEILING_MS },
      delay: LATENCY_CEILING_MS,
      delayState: DELAY_STATE.Slow,
    },
  ])('preserves the $level status independently of the override', ({ level, current, delay, delayState }) => {
    expect(toLatencyReading({ ...LATENCY, current, level }, 10_000)).toEqual({
      usual: 10_000,
      level,
      meter: { delay, delayState },
    });
    expect(toLatencyReading({ ...LATENCY, computedUsualMS: null, current, level })).toEqual({
      usual: null,
      level,
      meter: { delay, delayState },
    });
  });
});
