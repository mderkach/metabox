import { DefaultRuleBaseSchema } from "@shared/api/generated"

/**
 * Поле, которое есть у каждого правила, но условием не является: оно называет
 * ветку union, а не то, на что правило срабатывает.
 */
const RULE_TYPE_KEY = "type"

/**
 * Имена полей-условий. Берутся из генерируемой схемы, а не переписываются
 * руками: база правила в схеме форка — это ровно набор условий, действия
 * добавляются ветками поверх неё. Новый матчер в форке появится здесь сам.
 */
export const RULE_MATCHER_KEYS: readonly string[] = Object.keys(
  DefaultRuleBaseSchema.shape
).filter((key) => key !== RULE_TYPE_KEY)
