import { fakeEventSource } from '@test/fakeEventSource';
import { describe, expect, it, vi } from 'vitest';

import { RUNTIME_TOPIC } from '../runtimeStream';
import { watchSequence } from '../runtimeStream';

describe('watchSequence', () => {
  it('молчит, пока номера идут подряд', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn();

    watchSequence(stream.source, onGap);
    stream.send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });
    stream.send(RUNTIME_TOPIC.Memory, { inuse: 1, oslimit: 0 });
    stream.send(RUNTIME_TOPIC.Traffic, { up: 2, down: 2 });

    expect(onGap).not.toHaveBeenCalled();
  });

  it('сообщает о пропуске: демон считает номера без разрывов, пока события доходят', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn();

    watchSequence(stream.source, onGap);
    stream.send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });
    stream.sendRaw(RUNTIME_TOPIC.Traffic, JSON.stringify({ topic: RUNTIME_TOPIC.Traffic, seq: 9, data: {} }));

    expect(onGap).toHaveBeenCalledTimes(1);
  });

  it('не считает первый кадр пропуском: номера начинаются с любого', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn();

    watchSequence(stream.source, onGap);
    stream.sendRaw(RUNTIME_TOPIC.Service, JSON.stringify({ topic: RUNTIME_TOPIC.Service, seq: 42, data: {} }));

    expect(onGap).not.toHaveBeenCalled();
  });

  it('пропускает битый кадр, не роняя счёт', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn();

    watchSequence(stream.source, onGap);
    stream.send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });
    stream.sendRaw(RUNTIME_TOPIC.Traffic, '{ оборвался');
    stream.send(RUNTIME_TOPIC.Traffic, { up: 2, down: 2 });

    expect(onGap).not.toHaveBeenCalled();
  });

  it('отписка снимает обработчики со всех топиков', () => {
    const stream = fakeEventSource();
    const stop = watchSequence(stream.source, vi.fn());

    expect(stream.count(RUNTIME_TOPIC.Traffic)).toBe(1);
    stop();
    expect(stream.count(RUNTIME_TOPIC.Traffic)).toBe(0);
  });
});
