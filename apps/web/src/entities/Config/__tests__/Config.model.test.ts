import { describe, expect, it } from 'vitest';

import { parseConfig } from '../api/Config.query';
import {
  insertValue,
  removeValue,
  setValue,
  toFinalOutbound,
  toOutboundTypes,
  type ConfigDocument,
} from '../model/Config.model';
import { CONFIG_FIXTURE } from './Config.fixture';

const TEXT = JSON.stringify(CONFIG_FIXTURE, null, 2);

/**
 * Строк добавлено плюс удалено — то же число, что показал бы `diff`. Наивное
 * сравнение по индексу здесь врёт: вставка одной строки сдвигает весь хвост.
 */
function changedLines(before: string, after: string): number {
  const left = before.split('\n');
  const right = after.split('\n');
  const lcs = Array.from({ length: left.length + 1 }, () => Array.from({ length: right.length + 1 }, () => 0));

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      lcs[i][j] = left[i - 1] === right[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  const common = lcs[left.length][right.length];

  return left.length - common + (right.length - common);
}

/**
 * Ключи верхнего уровня читаются из текста, а не из разобранной модели: Zod
 * раскладывает поля в порядке схемы, и проверка по модели показала бы порядок
 * схемы вместо порядка файла — ровно то, от чего правка по тексту и защищает.
 */
function topLevelKeys(text: string): string[] {
  return [...text.matchAll(/^ {2}"([^"]+)":/gm)].map((match) => match[1]);
}

describe('setValue', () => {
  it('правка существующего поля меняет ровно одну строку конфига с устройства', () => {
    const after = setValue(TEXT, ['route', 'default_mark'], 200);

    expect(changedLines(TEXT, after)).toBe(2);
    expect(parseConfig(after).config?.route?.default_mark).toBe(200);
  });

  it('новое поле трогает только себя и запятую у соседа', () => {
    const after = setValue(TEXT, ['route', 'final'], 'direct');

    expect(changedLines(TEXT, after)).toBe(3);
    expect(parseConfig(after).config?.route?.final).toBe('direct');
  });

  it('не переставляет ключи: порядок секций в тексте остаётся прежним', () => {
    const after = setValue(TEXT, ['route', 'final'], 'direct');

    expect(topLevelKeys(after)).toEqual(topLevelKeys(TEXT));
    expect(topLevelKeys(TEXT)).toEqual(Object.keys(CONFIG_FIXTURE));
  });

  it('не трогает узлы, которых схема не знает', () => {
    const text = JSON.stringify({ route: { final: 'proxy' }, unknown_section: { a: [1, 2] } }, null, 2);
    const after = setValue(text, ['route', 'final'], 'direct');

    expect(Reflect.get(parseConfig(after).config ?? {}, 'unknown_section')).toEqual({ a: [1, 2] });
  });

  it('вставка повторяет отступ файла, отбитого табами', () => {
    const text = '{\n\t"route": {\n\t\t"final": "proxy"\n\t}\n}';
    const after = setValue(text, ['route', 'default_mark'], 100);

    expect(after).toContain('\n\t\t"default_mark": 100');
  });

  it('вставка повторяет отступ файла, отбитого четырьмя пробелами', () => {
    const text = '{\n    "route": {\n        "final": "proxy"\n    }\n}';
    const after = setValue(text, ['route', 'default_mark'], 100);

    expect(after).toContain('\n        "default_mark": 100');
  });

  it('вставка сохраняет перевод строки Windows', () => {
    const text = '{\r\n  "route": {\r\n    "final": "proxy"\r\n  }\r\n}';
    const after = setValue(text, ['route', 'default_mark'], 100);

    expect(after).toContain('\r\n    "default_mark": 100');
    expect(after).not.toContain('\n\n');
  });
});

describe('removeValue', () => {
  it('удаляет правило, оставляя соседние строки прежними', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];
    const after = removeValue(TEXT, ['route', 'rules', 0]);
    const left = parseConfig(after).config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length - 1);
    expect(left[0]).toEqual(rules[1]);
  });
});

describe('insertValue', () => {
  it('вставляет правило на место, а не поверх соседнего', () => {
    const rules = CONFIG_FIXTURE.route?.rules ?? [];
    const after = insertValue(TEXT, ['route', 'rules', 1], { action: 'route', outbound: 'direct' });
    const left = parseConfig(after).config?.route?.rules ?? [];

    expect(left).toHaveLength(rules.length + 1);
    expect(left[1]).toEqual({ action: 'route', outbound: 'direct' });
    expect(left[2]).toEqual(rules[1]);
  });
});

describe('toOutboundTypes', () => {
  it('сводит тег аутбаунда к его типу', () => {
    const types = toOutboundTypes(CONFIG_FIXTURE);

    expect(types.get('node-a-vless-reality')).toBe('vless');
    expect(types.get('proxy')).toBe('urltest');
    expect(types.get('alt-fallback')).toBe('selector');
    expect(types.get('direct')).toBe('direct');
  });

  it('аутбаунд без тега в карту не попадает: сослаться на него нечем', () => {
    const types = toOutboundTypes({ ...CONFIG_FIXTURE, outbounds: [{ type: 'direct' }] });

    expect(types.size).toBe(0);
  });

  it('конфига нет — карта пуста', () => {
    expect(toOutboundTypes(null).size).toBe(0);
  });
});

describe('toFinalOutbound', () => {
  const OUTBOUNDS: ConfigDocument['outbounds'] = [
    { type: 'direct', tag: 'direct' },
    { type: 'direct', tag: 'isp' },
  ];

  it('берёт route.final, если он задан', () => {
    expect(toFinalOutbound({ outbounds: OUTBOUNDS, route: { final: 'isp' } })).toBe('isp');
  });

  it('без route.final — первый аутбаунд, как решает sing-box', () => {
    expect(toFinalOutbound({ outbounds: OUTBOUNDS, route: {} })).toBe('direct');
    expect(toFinalOutbound({ outbounds: OUTBOUNDS })).toBe('direct');
  });

  it('без route.final и аутбаундов выхода нет', () => {
    expect(toFinalOutbound({})).toBeNull();
    expect(toFinalOutbound(null)).toBeNull();
  });
});
