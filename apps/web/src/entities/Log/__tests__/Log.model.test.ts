import { describe, expect, it } from 'vitest';

import { LOG_LIMIT, mergeLogEntries, type LogEntry } from '../model/Log.model';

function entry(message: string, second = 0): LogEntry {
  return { time: new Date(Date.UTC(2026, 9, 9, 10, 0, second)), level: 'info', message };
}

function messages(entries: readonly LogEntry[]): string[] {
  return entries.map((item) => item.message);
}

describe('mergeLogEntries', () => {
  it('drops the start of the stream that the tail already captured', () => {
    const tail = [entry('a', 1), entry('b', 2), entry('c', 3)];
    const streamed = [entry('b', 2), entry('c', 3), entry('d', 4)];

    expect(messages(mergeLogEntries(tail, streamed))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('without a common join puts the stream after the tail', () => {
    expect(messages(mergeLogEntries([entry('a', 1)], [entry('b', 2)]))).toEqual(['a', 'b']);
  });

  it('a line with the same text but a different timestamp does not count as a join', () => {
    expect(messages(mergeLogEntries([entry('a', 1)], [entry('a', 2)]))).toEqual(['a', 'a']);
  });

  it('lines without a timestamp and level are compared by text', () => {
    const bare: LogEntry = { time: null, level: null, message: 'goroutine 1 [running]:' };

    expect(mergeLogEntries([entry('a', 1), bare], [{ ...bare }, entry('b', 2)])).toHaveLength(3);
  });

  it('keeps no more than LOG_LIMIT lines, the newest last', () => {
    const streamed = Array.from({ length: LOG_LIMIT }, (_, index) => entry(`s${String(index)}`));
    const merged = mergeLogEntries([entry('старая')], streamed);

    expect(merged).toHaveLength(LOG_LIMIT);
    expect(merged.at(-1)?.message).toBe(`s${String(LOG_LIMIT - 1)}`);
    expect(merged[0].message).toBe('s0');
  });
});
