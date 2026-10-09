import { describe, expect, it } from 'vitest';

import { LogsSchema } from '../api/Log.schema';
import { toLogTail } from '../model/Log.adapter';
import { LOGS_FIXTURE } from './Log.fixture';

describe('toLogTail', () => {
  it('переводит метку времени в дату, а строку без уровня оставляет без уровня', () => {
    const tail = toLogTail(LogsSchema.parse(LOGS_FIXTURE));

    expect(tail.source).toBe('logread');
    expect(tail.since).toBeNull();
    expect(tail.entries[0].time?.toISOString()).toBe('2026-10-09T07:00:01.000Z');
    expect(tail.entries[0].level).toBe('info');
    expect(tail.entries.at(-1)).toEqual({ time: null, level: null, message: '  goroutine 1 [running]:' });
  });

  it('незнакомый уровень и неразборчивую метку считает отсутствующими', () => {
    const tail = toLogTail({
      source: 'file',
      since: 'вчера',
      entries: [{ time: 'не время', level: 'notice', message: 'строка' }],
    });

    expect(tail.since).toBeNull();
    expect(tail.entries[0]).toEqual({ time: null, level: null, message: 'строка' });
  });

  it('схема отклоняет строку без сообщения', () => {
    expect(LogsSchema.safeParse({ source: 'logread', entries: [{ level: 'info' }] }).success).toBe(false);
  });
});
