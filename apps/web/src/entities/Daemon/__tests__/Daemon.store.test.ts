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

describe('закрытие потока', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
  });

  it('снимает отметку последнего кадра, а буфер графика оставляет', () => {
    RuntimeStore.getState().pushTraffic({ up: 1, down: 2 });
    RuntimeStore.getState().closeStream();

    expect(RuntimeStore.getState().sampledAt).toBeNull();
    expect(RuntimeStore.getState().traffic).toEqual([{ up: 1, down: 2 }]);
  });

  // По отметке снимка экран отличает молчание sing-box от обрыва связи с
  // демоном; отметка из прошлого подключения выдала бы обрыв за живой поток.
  it('снимает и отметку снимка устройства, который шлёт демон', () => {
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

describe('показания устройства', () => {
  beforeEach(() => {
    RuntimeStore.getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('первый снимок скорость канала не считает: считать её не с чем', () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenSystem(source);

    send(RUNTIME_TOPIC.System, SYSTEM_FIXTURE);

    expect(RuntimeStore.getState().system?.thermal[0].celsius).toBe(42.578);
    expect(RuntimeStore.getState().uplink).toEqual({ rx: 0, tx: 0 });

    unsubscribe();
  });

  it('скорость канала считает по приращению счётчиков за интервал', async () => {
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

  it('смена интерфейса скорость обнуляет: счётчики у нового свои', async () => {
    const { source, send } = fakeEventSource();
    const unsubscribe = listenSystem(source);

    send(RUNTIME_TOPIC.System, SYSTEM_FIXTURE);
    await vi.advanceTimersByTimeAsync(2000);
    send(RUNTIME_TOPIC.System, { ...SYSTEM_FIXTURE, uplink: { name: 'wwan0', rx: 10, tx: 10 } });

    expect(RuntimeStore.getState().uplink).toEqual({ rx: 0, tx: 0 });

    unsubscribe();
  });
});

describe('время точек трафика', () => {
  it('раскладывает точки назад от последней с шагом потока, а не по времени прихода', () => {
    expect(toTrafficTimes(3, 10_000)).toEqual([8, 9, 10]);
  });

  it('полный буфер начинается не правее левой кромки окна, даже когда точка только что пришла', () => {
    const arrivedAt = 100_000;
    const [oldest] = toTrafficTimes(TRAFFIC_POINTS, arrivedAt);
    const leftEdge = arrivedAt / 1000 - TRAFFIC_STEP_SECONDS - TRAFFIC_WINDOW_SECONDS;

    expect(oldest).toBeLessThanOrEqual(leftEdge);
  });

  it('заполняет пустой буфер трафика минутой от демона, а заполненный не трогает', () => {
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
    // Минута от демона — не кадр потока: живым поток она не делает.
    expect(RuntimeStore.getState().sampledAt).toBeNull();

    store.seedTraffic([{ down: 9, up: 9 }]);

    expect(RuntimeStore.getState().traffic).toHaveLength(2);
  });
});
