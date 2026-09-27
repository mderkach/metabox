import { describe, expect, it } from 'vitest';

import { parseConfig } from '../api/Config.query';
import { findValue, readRules, setValue } from '../model/Config.model';

/**
 * Корпус подхватывается каталогом целиком: новый конфиг достаточно положить
 * рядом, правка теста не нужна. `?raw` отдаёт байты файла, а не разобранный
 * модуль, — round-trip проверяется на тексте, как он лежит на устройстве.
 */
const CORPUS = import.meta.glob<string>('./corpus/*.json*', { query: '?raw', import: 'default', eager: true });

const FILES = Object.entries(CORPUS).map(([path, text]) => ({
  name: path.replace('./corpus/', ''),
  text,
}));

/** Ключи верхнего уровня в порядке файла: по модели порядок был бы схемы. */
function topLevelKeys(text: string): string[] {
  return [...text.matchAll(/^(?: {2}|\t)"([^"]+)":/gm)].map((match) => match[1]);
}

describe('корпус конфигов', () => {
  it('в каталоге лежат файлы', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES)('$name разбирается', ({ text }) => {
    expect(parseConfig(text).issues).toEqual([]);
  });

  it.each(FILES)('$name не теряет правила при разборе текста', ({ text }) => {
    const fromText = readRules(text).length;
    const fromModel = parseConfig(text).config?.route?.rules?.length ?? 0;

    expect(fromText).toBe(fromModel);
  });

  it.each(FILES)('$name переживает правку одного поля без потерь', ({ text }) => {
    const after = setValue(text, ['route', 'final'], 'direct');

    expect(parseConfig(after).config?.route?.final).toBe('direct');
    expect(topLevelKeys(after)).toEqual(topLevelKeys(text));
  });

  it.each(FILES)('$name сохраняет свои переводы строк', ({ text }) => {
    const after = setValue(text, ['route', 'final'], 'direct');
    const crlfBefore = (text.match(/\r\n/g) ?? []).length;
    const crlfAfter = (after.match(/\r\n/g) ?? []).length;

    // Правка меняет одну строку, поэтому счётчик CRLF сдвигается не больше
    // чем на неё: файл с CRLF не должен переехать на LF целиком.
    expect(Math.abs(crlfAfter - crlfBefore)).toBeLessThanOrEqual(1);
  });

  it('конфиг с комментариями сохраняет их после правки', () => {
    const file = FILES.find((item) => item.name.endsWith('.jsonc'));

    expect(file).toBeDefined();

    const after = setValue(file?.text ?? '', ['route', 'final'], 'direct');

    expect(after).toContain('// Конфиг собран руками');
    expect(after).toContain('/* Порядок правил и есть логика');
  });

  it('поля, которых схема не знает, названы поимённо', () => {
    const file = FILES.find((item) => item.name === 'unknown-nodes.json');
    const parsed = parseConfig(file?.text ?? '');

    expect(parsed.config).not.toBeNull();
    expect(parsed.unknown.map((item) => item.path)).toEqual(
      expect.arrayContaining(['', 'outbounds.1', 'route.rules.0'])
    );
    expect(parsed.unknown.flatMap((item) => item.fields)).toEqual(
      expect.arrayContaining(['vendor_extension', 'unknown_option', 'unknown_matcher'])
    );
  });

  it.each(FILES.filter((item) => item.name !== 'unknown-nodes.json'))('$name схема принимает целиком', ({ text }) => {
    expect(parseConfig(text).unknown).toEqual([]);
  });

  it('правка узла целиком не трогает комментарии и соседние узлы', () => {
    const file = FILES.find((item) => item.name === 'handwritten.jsonc');

    expect(file).toBeDefined();

    const text = file?.text ?? '';
    const node = findValue(text, ['outbounds', 0]);

    expect(node).toBeDefined();

    const after = setValue(text, ['outbounds', 0], { ...(typeof node === 'object' ? node : {}), tag: 'renamed' });

    const commentsOf = (source: string) => source.split('\n').filter((line) => line.includes('//')).length;

    expect(commentsOf(after)).toBe(commentsOf(text));
    expect(topLevelKeys(after)).toEqual(topLevelKeys(text));
    expect(JSON.stringify(findValue(after, ['outbounds', 1]))).toBe(JSON.stringify(findValue(text, ['outbounds', 1])));
    expect(findValue(after, ['outbounds', 0, 'tag'])).toBe('renamed');
  });

  it('незнакомые узлы переживают правку соседнего поля', () => {
    const file = FILES.find((item) => item.name === 'unknown-nodes.json');

    expect(file).toBeDefined();

    const after = setValue(file?.text ?? '', ['log', 'level'], 'debug');
    const parsed = parseConfig(after).config;

    expect(Reflect.get(parsed ?? {}, 'vendor_extension')).toEqual({
      enabled: true,
      profiles: [{ name: 'own', weight: 3 }],
    });
    expect(after).toContain('"unknown_matcher"');
    expect(after).toContain('"unknown_option"');
  });
});
