import { describe, expect, it } from 'vitest';

import { RULE_SET_ADD_ERROR } from '../model/RuleSetAdd.constants';
import { makeRuleSetAddSchema, ruleSetAddDefaults, toRuleSetPatch } from '../model/RuleSetAdd.schema';

const GEOSITE_GOOGLE = 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs';

function filled(overrides: Partial<ReturnType<typeof ruleSetAddDefaults>> = {}) {
  return { ...ruleSetAddDefaults(), category: 'google', url: GEOSITE_GOOGLE, tag: 'geosite-google', ...overrides };
}

describe('makeRuleSetAddSchema', () => {
  it('принимает заполненную форму', () => {
    expect(makeRuleSetAddSchema([]).safeParse(filled()).success).toBe(true);
  });

  // Тег — ссылка, по которой правило находит набор: второй набор с тем же
  // именем сделал бы её двусмысленной.
  it('не принимает занятое имя', () => {
    const parsed = makeRuleSetAddSchema(['geosite-google']).safeParse(filled());

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.TagTaken);
  });

  it('не принимает адрес без схемы', () => {
    const parsed = makeRuleSetAddSchema([]).safeParse(filled({ url: 'example.com/list.srs' }));

    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.UrlScheme);
  });

  // У адреса без расширения формат вывести нечем, и без него ядро не поймёт,
  // что скачало.
  it('требует формат, когда адрес его не подсказывает', () => {
    const parsed = makeRuleSetAddSchema([]).safeParse(filled({ url: 'https://example.com/list?id=5' }));

    expect(parsed.error?.issues[0].message).toBe(RULE_SET_ADD_ERROR.FormatRequired);
  });
});

describe('toRuleSetPatch', () => {
  // Значение, равное выведенному, ядро при сохранении отбрасывает само, а в
  // дифе оно выглядело бы правкой, которой пользователь не делал (AC-2).
  it('не пишет формат, когда его видно по расширению', () => {
    expect(toRuleSetPatch(filled({ format: 'binary' }))).toEqual({
      type: 'remote',
      tag: 'geosite-google',
      url: GEOSITE_GOOGLE,
    });
  });

  it('пишет формат, когда расширение его не подсказывает', () => {
    const patch = toRuleSetPatch(filled({ url: 'https://example.com/list?id=5', format: 'source' }));

    expect(patch.format).toBe('source');
  });

  it('не пишет пустые необязательные поля', () => {
    const patch = toRuleSetPatch(filled({ updateInterval: '', detour: '' }));

    expect(patch).not.toHaveProperty('update_interval');
    expect(patch).not.toHaveProperty('download_detour');
  });

  it('пишет интервал и узел, когда они заданы', () => {
    const patch = toRuleSetPatch(filled({ updateInterval: '3d', detour: 'proxy' }));

    expect(patch.update_interval).toBe('3d');
    expect(patch.download_detour).toBe('proxy');
  });
});
