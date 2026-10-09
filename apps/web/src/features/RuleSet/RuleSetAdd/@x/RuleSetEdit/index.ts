// Что форма подключения разрешает правке сета: те же поля и проверки, чтобы
// существующий сет правился по тем же правилам, по которым его добавляли.
export { CUSTOM_PROVIDER } from '../../model/RuleSetAdd.constants';
export { makeRuleSetAddSchema, RuleSetAddSchema } from '../../model/RuleSetAdd.schema';
export type { RuleSetAddModel } from '../../model/RuleSetAdd.schema';
export { ExtraFields, FormatField, TagField } from '../../ui/RuleSetAddForm';
