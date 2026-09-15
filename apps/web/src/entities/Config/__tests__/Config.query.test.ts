import { describe, expect, it } from 'vitest';

import { CONFIG_QUERY, parseConfig } from '../api/Config.query';
import { CONFIG_FIXTURE } from './Config.fixture';

describe('CONFIG_QUERY', () => {
  it('строит частный ключ от общего, чтобы работала массовая инвалидация', () => {
    expect(CONFIG_QUERY.all).toEqual(['config']);
    expect(CONFIG_QUERY.current()).toEqual(['config', 'current']);
  });
});

describe('parseConfig', () => {
  it('разбирает конфиг с устройства без замечаний', () => {
    const parsed = parseConfig(JSON.stringify(CONFIG_FIXTURE));

    expect(parsed.issues).toEqual([]);
    expect(parsed.config?.route?.rules).toHaveLength(32);
  });

  it('сохраняет узлы, которых нет в схеме: их нельзя терять при round-trip', () => {
    const parsed = parseConfig(JSON.stringify({ ...CONFIG_FIXTURE, unknown_section: { a: 1 } }));

    expect(parsed.issues).toEqual([]);
    expect(Reflect.get(parsed.config ?? {}, 'unknown_section')).toEqual({ a: 1 });
  });

  it('на неразобранном конфиге отдаёт замечания, а не пустой результат', () => {
    const parsed = parseConfig(JSON.stringify({ inbounds: 'не список' }));

    expect(parsed.config).toBeNull();
    expect(parsed.issues.length).toBeGreaterThan(0);
    expect(parsed.issues[0]).toContain('inbounds');
  });

  it('отдаёт исходный текст обратно: правки применяются к нему, а не к модели', () => {
    const text = JSON.stringify(CONFIG_FIXTURE, null, 2);

    expect(parseConfig(text).text).toBe(text);
  });

  it('пустой ответ — тоже замечание, а не пустой конфиг', () => {
    const parsed = parseConfig('');

    expect(parsed.config).toBeNull();
    expect(parsed.issues).toHaveLength(1);
  });

  it('на битом файле не бросает: панель обязана открыться и на нём', () => {
    const parsed = parseConfig('{ "route": ');

    expect(parsed.config).toBeNull();
    expect(parsed.issues[0]).toContain('не разбирается');
  });
});
