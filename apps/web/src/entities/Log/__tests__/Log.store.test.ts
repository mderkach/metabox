import { beforeEach, describe, expect, it } from 'vitest';

import { LOG_LIMIT, type LogEvent } from '../model/Log.model';
import { LogStore } from '../model/Log.store';

function event(seq: number, message = `строка ${String(seq)}`): LogEvent {
  return { seq, entry: { time: null, level: 'info', message } };
}

describe('LogStore', () => {
  beforeEach(() => {
    LogStore.getState().reset();
  });

  it('копит строки потока в порядке прихода', () => {
    LogStore.getState().append([event(1), event(2)]);
    LogStore.getState().append([event(3)]);

    expect(LogStore.getState().entries.map((entry) => entry.message)).toEqual(['строка 1', 'строка 2', 'строка 3']);
    expect(LogStore.getState().lost).toBe(0);
  });

  it('считает потерянные строки по разрыву seq', () => {
    LogStore.getState().append([event(1), event(4)]);
    LogStore.getState().append([event(5), event(7)]);

    expect(LogStore.getState().lost).toBe(3);
  });

  it('новое соединение начинает нумерацию заново и не считается потерей', () => {
    LogStore.getState().append([event(1), event(2)]);
    LogStore.getState().restart();
    LogStore.getState().append([event(1)]);

    expect(LogStore.getState().lost).toBe(0);
    expect(LogStore.getState().entries.map((entry) => entry.message)).toEqual(['строка 1']);
  });

  it('держит не больше LOG_LIMIT строк, выбрасывая старые', () => {
    const events = Array.from({ length: LOG_LIMIT + 5 }, (_, index) => event(index + 1));

    LogStore.getState().append(events);

    expect(LogStore.getState().entries).toHaveLength(LOG_LIMIT);
    expect(LogStore.getState().entries[0].message).toBe('строка 6');
  });

  it('пустая пачка состояние не меняет', () => {
    const before = LogStore.getState();

    LogStore.getState().append([]);

    expect(LogStore.getState()).toBe(before);
  });
});
