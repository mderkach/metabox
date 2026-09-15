import { describe, expect, it } from 'vitest';

import type { Config } from '@shared/api/generated';

import { checkRuleNode, isRuleRecognized, toRuleRows, toRuleRowsFromNodes } from '../model/Rule.adapter';
import { RULE_TARGET } from '../model/Rule.model';

function configWithRules(rules: object[]): Config {
  return { route: { rules } };
}

describe('toRuleRows', () => {
  it('возвращает пустой список, когда правил нет', () => {
    expect(toRuleRows(null)).toEqual([]);
    expect(toRuleRows({})).toEqual([]);
  });

  it('нумерует правила с единицы и сохраняет порядок из конфига', () => {
    const rows = toRuleRows(
      configWithRules([
        { rule_set: ['openai'], outbound: 'proxy' },
        { rule_set: ['github'], outbound: 'direct' },
      ])
    );

    expect(rows.map((row) => row.index)).toEqual([1, 2]);
    expect(rows.map((row) => row.target)).toEqual(['proxy', 'direct']);
  });

  it('собирает условия из полей схемы и приводит значения к списку', () => {
    const [row] = toRuleRows(configWithRules([{ port: 53, domain_suffix: ['rt.ru', 'usmall.ru'] }]));

    expect(row.matchers).toContainEqual({ key: 'port', values: ['53'] });
    expect(row.matchers).toContainEqual({
      key: 'domain_suffix',
      values: ['rt.ru', 'usmall.ru'],
    });
  });

  it('упорядочивает условия по схеме, а не по порядку ключей в файле', () => {
    const direct = toRuleRows(configWithRules([{ domain_suffix: ['rt.ru'], port: 53 }]));
    const reversed = toRuleRows(configWithRules([{ port: 53, domain_suffix: ['rt.ru'] }]));

    expect(direct[0].matchers).toEqual(reversed[0].matchers);
  });

  it('различает outbound и action', () => {
    const rows = toRuleRows(
      configWithRules([
        { inbound: ['dns-in'], action: 'hijack-dns' },
        { rule_set: ['apple'], outbound: 'proxy' },
      ])
    );

    expect(rows[0].targetKind).toBe(RULE_TARGET.Action);
    expect(rows[0].target).toBe('hijack-dns');
    expect(rows[1].targetKind).toBe(RULE_TARGET.Outbound);
  });

  it('считает route действием по умолчанию, когда его не указали', () => {
    const [row] = toRuleRows(configWithRules([{ domain: ['example.com'] }]));

    expect(row.target).toBe('route');
    expect(row.targetKind).toBe(RULE_TARGET.Action);
  });

  it('отмечает правило без условий: оно ловит весь остальной трафик', () => {
    const [row] = toRuleRows(configWithRules([{ outbound: 'direct' }]));

    expect(row.isCatchAll).toBe(true);
    expect(row.matchers).toEqual([]);
  });

  it('не считает условием служебное поле type', () => {
    const [row] = toRuleRows(configWithRules([{ type: 'default', outbound: 'direct' }]));

    expect(row.matchers).toEqual([]);
  });

  it('складывает условия и цель в строку поиска', () => {
    const [row] = toRuleRows(configWithRules([{ domain_suffix: ['rt.ru'], outbound: 'direct' }]));

    expect(row.searchText).toBe('domain_suffix rt.ru direct');
  });
});

describe('логические правила', () => {
  it('не считает логическое правило безусловным', () => {
    const [row] = toRuleRows(
      configWithRules([
        {
          type: 'logical',
          mode: 'or',
          rules: [{ port: 853 }, { network: 'udp', port: 443 }],
          action: 'reject',
        },
      ])
    );

    expect(row.isCatchAll).toBe(false);
    expect(row.group?.mode).toBe('or');
    expect(row.group?.children).toHaveLength(2);
  });

  it('разворачивает вложенность и оставляет условия внутри веток', () => {
    const [row] = toRuleRows(
      configWithRules([
        {
          type: 'logical',
          mode: 'and',
          rules: [
            { rule_set: ['geoip-cn'] },
            { type: 'logical', mode: 'or', rules: [{ domain_suffix: ['cn'] }], invert: true },
          ],
          outbound: 'direct',
        },
      ])
    );

    expect(row.group?.children[0]?.matchers).toContainEqual({ key: 'rule_set', values: ['geoip-cn'] });
    expect(row.group?.children[1]?.group?.invert).toBe(true);
    expect(row.group?.children[1]?.group?.children[0]?.matchers).toContainEqual({
      key: 'domain_suffix',
      values: ['cn'],
    });
  });

  it('ищет по условиям вложенных веток, а не только по верхнему уровню', () => {
    const [row] = toRuleRows(
      configWithRules([{ type: 'logical', mode: 'or', rules: [{ domain_suffix: ['media.example'] }] }])
    );

    expect(row.searchText).toContain('media.example');
  });
});

describe('действия кроме route', () => {
  it('показывает параметры действия рядом с ним', () => {
    const rows = toRuleRows(
      configWithRules([
        { port: 443, action: 'reject', method: 'drop' },
        { action: 'sniff', sniffer: ['tls', 'http'] },
        { port: 53, action: 'hijack-dns' },
      ])
    );

    expect(rows[0]?.targetDetail).toBe('method: drop');
    expect(rows[1]?.targetDetail).toBe('sniffer: tls, http');
    expect(rows[2]?.targetDetail).toBeNull();
  });

  it('не путает инверсию с условием', () => {
    const [row] = toRuleRows(configWithRules([{ rule_set: ['github'], invert: true, outbound: 'direct' }]));

    expect(row.invert).toBe(true);
    expect(row.matchers).toEqual([{ key: 'rule_set', values: ['github'] }]);
  });
  it('нумерует правила по их месту в файле, а не по порядку в списке', () => {
    // Массив правит человек, и попавший в него не-объект пропускается. Если
    // считать позицию после пропуска, правка следующего правила ушла бы в
    // соседний узел файла.
    const rows = toRuleRowsFromNodes([null, { rule_set: ['github'], outbound: 'proxy' }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.index).toBe(2);
    expect(rows[0]?.id).toBe('1');
  });
});

describe('узлы, которых схема не знает', () => {
  it('правило с незнакомым условием не считается распознанным', () => {
    expect(isRuleRecognized({ unknown_matcher: ['своё'], outbound: 'direct' })).toBe(false);
  });

  it('обычное правило по-прежнему распознаётся', () => {
    expect(isRuleRecognized({ domain_suffix: ['example.com'], outbound: 'direct' })).toBe(true);
  });

  it('строка списка помечает такое правило, а не выдаёт его за безусловное', () => {
    const [row] = toRuleRowsFromNodes([{ unknown_matcher: ['своё'], outbound: 'direct' }]);

    expect(row.recognized).toBe(false);
    expect(row.isCatchAll).toBe(true);
  });

  it('замечание схемы называет поле, которого она не знает', () => {
    expect(checkRuleNode({ unknown_matcher: ['своё'], outbound: 'direct' }).join(' ')).toContain('unknown_matcher');
  });
});
