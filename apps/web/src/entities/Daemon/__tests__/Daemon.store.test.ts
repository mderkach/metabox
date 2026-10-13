import { fakeEventSource } from '@test/fakeEventSource';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RUNTIME_TOPIC } from '@shared/api';

import { listenMemory, listenSystem, listenTraffic } from '../api/Daemon.stream';
import {
  MEMORY_EVERY,
  RuntimeStore,
  TRAFFIC_POINTS,
  TRAFFIC_STEP_SECONDS,
  TRAFFIC_WINDOW_SECONDS,
  toTrafficTimes,
} from '../model/Daemon.store';
import { MEMORY_SAMPLES, SYSTEM_FIXTURE } from './Daemon.fixture';

describe('traffic stream', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
  });

  it('keeps a minute and does not accumulate history beyond it', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenTraffic(source);

    for (let index = 0; index < TRAFFIC_POINTS + 20; index += 1) {
      send(RUNTIME_TOPIC.Traffic, { up: index, down: index * 2 });
    }

    expect(RuntimeStore.getState().traffic).toHaveLength(TRAFFIC_POINTS);
    expect(RuntimeStore.getState().traffic.at(-1)).toEqual({
      up: TRAFFIC_POINTS + 19,
      down: (TRAFFIC_POINTS + 19) * 2,
    });

    unsubscribe();
  });

  it('removes the handler on unsubscribe', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenTraffic(source);

    unsubscribe();
    send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });

    expect(RuntimeStore.getState().traffic).toHaveLength(0);
  });
});

describe('stream close', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
  });

  it('clears the last-frame mark and leaves the chart buffer', () => {
    RuntimeStore.getState().pushTraffic({ up: 1, down: 2 });
    RuntimeStore.getState().closeStream();

    expect(RuntimeStore.getState().sampledAt).toBeNull();
    expect(RuntimeStore.getState().traffic).toEqual([{ up: 1, down: 2 }]);
  });

  // By the snapshot mark the screen tells sing-box silence from a lost connection to
  // the daemon; a mark from a previous connection would pass a lost connection off as a live stream.
  it('also clears the mark of the device snapshot that the daemon sends', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenSystem(source);

    send(RUNTIME_TOPIC.System, SYSTEM_FIXTURE);

    expect(RuntimeStore.getState().systemAt).not.toBeNull();

    RuntimeStore.getState().closeStream();

    expect(RuntimeStore.getState().systemAt).toBeNull();
    expect(RuntimeStore.getState().system).not.toBeNull();

    unsubscribe();
  });
});

describe('memory stream', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
  });

  it('skips the zero first sample instead of showing "memory 0"', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenMemory(source);

    send(RUNTIME_TOPIC.Memory, { inuse: MEMORY_SAMPLES[0], oslimit: 0 });

    expect(RuntimeStore.getState().memoryNow).toBe(0);
    expect(RuntimeStore.getState().memory).toHaveLength(0);

    send(RUNTIME_TOPIC.Memory, { inuse: MEMORY_SAMPLES[1], oslimit: 0 });

    expect(RuntimeStore.getState().memoryNow).toBe(MEMORY_SAMPLES[1]);

    unsubscribe();
  });

  it('puts every tenth sample into the buffer: the memory window is wider than the traffic window', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenMemory(source);

    for (let index = 1; index <= MEMORY_EVERY * 3; index += 1) {
      send(RUNTIME_TOPIC.Memory, { inuse: index * 1000, oslimit: 0 });
    }

    expect(RuntimeStore.getState().memory).toHaveLength(3);
    expect(RuntimeStore.getState().memoryNow).toBe(MEMORY_EVERY * 3 * 1000);

    unsubscribe();
  });
});

describe('device readings', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the first snapshot does not compute channel speed: there is nothing to compute it from', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenSystem(source);

    send(RUNTIME_TOPIC.System, SYSTEM_FIXTURE);

    expect(RuntimeStore.getState().system?.thermal[0].celsius).toBe(42.578);
    expect(RuntimeStore.getState().uplink).toEqual({ rx: 0, tx: 0 });

    unsubscribe();
  });

  it('computes channel speed from the counter increment over the interval', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenSystem(source);
    const uplink = SYSTEM_FIXTURE.uplink;

    if (uplink === undefined) {
      throw new Error('в фикстуре нет интерфейса наружу');
    }

    send(RUNTIME_TOPIC.System, SYSTEM_FIXTURE);
    await vi.advanceTimersByTimeAsync(2000);
    send(RUNTIME_TOPIC.System, {
      ...SYSTEM_FIXTURE,
      uplink: { ...uplink, rx: uplink.rx + 4000, tx: uplink.tx + 2000 },
    });

    expect(RuntimeStore.getState().uplink).toEqual({ rx: 2000, tx: 1000 });

    unsubscribe();
  });

  it('an interface change zeroes the speed: the new one has its own counters', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenSystem(source);

    send(RUNTIME_TOPIC.System, SYSTEM_FIXTURE);
    await vi.advanceTimersByTimeAsync(2000);
    send(RUNTIME_TOPIC.System, { ...SYSTEM_FIXTURE, uplink: { name: 'wwan0', rx: 10, tx: 10 } });

    expect(RuntimeStore.getState().uplink).toEqual({ rx: 0, tx: 0 });

    unsubscribe();
  });
});

describe('traffic point time', () => {
  it('lays points back from the last one with the stream step, not by arrival time', () => {
    expect(toTrafficTimes(3, 10_000)).toEqual([8, 9, 10]);
  });

  it('a full buffer starts no further right than the left edge of the window, even when a point has just arrived', () => {
    const arrivedAt = 100_000;
    const [oldest] = toTrafficTimes(TRAFFIC_POINTS, arrivedAt);
    const leftEdge = arrivedAt / 1000 - TRAFFIC_STEP_SECONDS - TRAFFIC_WINDOW_SECONDS;

    expect(oldest).toBeLessThanOrEqual(leftEdge);
  });

  it('fills an empty traffic buffer with the daemon minute, and does not touch a filled one', () => {
    const store = RuntimeStore.getState();

    store.reset();
    store.seedTraffic([
      { down: 1, up: 2 },
      { down: 3, up: 4 },
    ]);

    expect(RuntimeStore.getState().traffic).toEqual([
      { down: 1, up: 2 },
      { down: 3, up: 4 },
    ]);
    expect(RuntimeStore.getState().trafficAt).not.toBeNull();
    // The daemon minute is not a stream frame: it does not make the stream live.
    expect(RuntimeStore.getState().sampledAt).toBeNull();

    store.seedTraffic([{ down: 9, up: 9 }]);

    expect(RuntimeStore.getState().traffic).toHaveLength(2);
  });
});
