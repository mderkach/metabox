import { fakeEventSource } from '@test/fakeEventSource';
import { describe, expect, it, vi } from 'vitest';

import { listenTopic, RUNTIME_TOPIC } from '../runtimeStream';
import { watchSequence } from '../runtimeStream';

describe('watchSequence', () => {
  it('stays silent while the numbers go in sequence', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn<() => void>();

    watchSequence(stream.source, onGap);
    stream.send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });
    stream.send(RUNTIME_TOPIC.Memory, { inuse: 1, oslimit: 0 });
    stream.send(RUNTIME_TOPIC.Traffic, { up: 2, down: 2 });

    expect(onGap).not.toHaveBeenCalled();
  });

  it('reports a gap: the daemon counts numbers without gaps while events arrive', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn<() => void>();

    watchSequence(stream.source, onGap);
    stream.send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });
    stream.sendRaw(RUNTIME_TOPIC.Traffic, JSON.stringify({ topic: RUNTIME_TOPIC.Traffic, seq: 9, data: {} }));

    expect(onGap).toHaveBeenCalledTimes(1);
  });

  it('does not count the first frame as a gap: numbers start from any', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn<() => void>();

    watchSequence(stream.source, onGap);
    stream.sendRaw(RUNTIME_TOPIC.Service, JSON.stringify({ topic: RUNTIME_TOPIC.Service, seq: 42, data: {} }));

    expect(onGap).not.toHaveBeenCalled();
  });

  it('skips a broken frame without breaking the count', () => {
    const stream = fakeEventSource();
    const onGap = vi.fn<() => void>();

    watchSequence(stream.source, onGap);
    stream.send(RUNTIME_TOPIC.Traffic, { up: 1, down: 1 });
    stream.sendRaw(RUNTIME_TOPIC.Traffic, '{ оборвался');
    stream.send(RUNTIME_TOPIC.Traffic, { up: 2, down: 2 });

    expect(onGap).not.toHaveBeenCalled();
  });

  it('unsubscribing removes handlers from all topics', () => {
    const stream = fakeEventSource();
    const stop = watchSequence(stream.source, vi.fn<() => void>());

    expect(stream.count(RUNTIME_TOPIC.Traffic)).toBe(1);
    stop();
    expect(stream.count(RUNTIME_TOPIC.Traffic)).toBe(0);
  });
});

describe('listenTopic', () => {
  it('shares one parse of a frame with the sequence watch', () => {
    const stream = fakeEventSource();
    const apply = vi.fn<(data: unknown) => void>();

    watchSequence(stream.source, vi.fn<() => void>());
    listenTopic(stream.source, RUNTIME_TOPIC.Connections, apply);

    const parse = vi.spyOn(JSON, 'parse');

    stream.send(RUNTIME_TOPIC.Connections, { connections: [] });

    expect(parse).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ connections: [] });
    parse.mockRestore();
  });

  it('skips a frame that is not JSON without a warning', () => {
    const stream = fakeEventSource();
    const apply = vi.fn<(data: unknown) => void>();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    listenTopic(stream.source, RUNTIME_TOPIC.Traffic, apply);
    stream.sendRaw(RUNTIME_TOPIC.Traffic, '{ оборвался');

    expect(apply).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
