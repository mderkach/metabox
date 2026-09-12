import { DefaultRuleBaseSchema } from '@shared/api/generated';

/**
 * Поля, которые есть у правила, но условием не являются: `type` называет ветку
 * union, `invert` переворачивает результат уже собранных условий.
 */
const NOT_MATCHER_KEYS = new Set(['type', 'invert']);

/**
 * Имена полей-условий. Берутся из генерируемой схемы, а не переписываются
 * руками: база правила в схеме форка — это ровно набор условий, действия
 * добавляются ветками поверх неё. Новый матчер в форке появится здесь сам.
 *
 * Логическое правило под это не подпадает: его условия лежат во вложенных
 * `rules`, которых в базе нет, — разбирает их `Rule.adapter`.
 */
export const RULE_MATCHER_KEYS: readonly string[] = Object.keys(DefaultRuleBaseSchema.shape).filter(
  (key) => !NOT_MATCHER_KEYS.has(key)
);

/**
 * Поля, уточняющие действие. Показываются рядом с ним: `reject` без `method`
 * и `reject` с `method: drop` ведут себя по-разному, а в списке выглядели бы
 * одинаково.
 */
export const RULE_ACTION_FIELDS: Readonly<Partial<Record<string, readonly string[]>>> = {
  reject: ['method'],
  sniff: ['sniffer', 'timeout'],
  resolve: ['server', 'strategy'],
};
