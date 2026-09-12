import { fakeEventSource } from '@test/fakeEventSource';
import { beforeEach, describe, expect, it } from 'vitest';

import { RUNTIME_TOPIC } from '@shared/api';

import { listenMemory, listenTraffic } from '../api/Daemon.stream';
import { MEMORY_EVERY, RuntimeStore, TRAFFIC_POINTS } from '../model/Daemon.store';
import { MEMORY_SAMPLES } from './Daemon.fixture';

describe('поток трафика', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
  });

  it('держит минуту и не копит историю дальше', () => {
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

  it('снимает обработчик при отписке', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenTraffic(source);

    unsubscribe();
    send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });

    expect(RuntimeStore.getState().traffic).toHaveLength(0);
  });
});

describe('поток памяти', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
  });

  it('пропускает нулевой первый сэмпл, а не показывает «памяти 0»', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenMemory(source);

    send(RUNTIME_TOPIC.Memory, { inuse: MEMORY_SAMPLES[0], oslimit: 0 });

    expect(RuntimeStore.getState().memoryNow).toBe(0);
    expect(RuntimeStore.getState().memory).toHaveLength(0);

    send(RUNTIME_TOPIC.Memory, { inuse: MEMORY_SAMPLES[1], oslimit: 0 });

    expect(RuntimeStore.getState().memoryNow).toBe(MEMORY_SAMPLES[1]);

    unsubscribe();
  });

  it('в буфер кладёт каждый десятый сэмпл: окно памяти шире окна трафика', () => {
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
