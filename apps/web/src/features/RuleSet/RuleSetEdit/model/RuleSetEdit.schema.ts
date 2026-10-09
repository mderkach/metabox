import { z } from 'zod';

import {
  CUSTOM_PROVIDER,
  makeRuleSetAddSchema,
  RuleSetAddSchema,
  type RuleSetAddModel,
} from '@features/RuleSet/RuleSetAdd/@x/RuleSetEdit';

/**
 * Что правит форма существующего сета: поля формы подключения, но адрес
 * может быть пуст — поле адреса общее с формами узлов и очищенным держит
 * `null`, а не пустую строку.
 */
export const RuleSetEditSchema = RuleSetAddSchema.extend({
  /** Адрес, по которому ядро скачивает набор; `null` — поле очищено */
  url: z.string().nullable(),
});

export type RuleSetEditModel = z.infer<typeof RuleSetEditSchema>;

/**
 * Проверки те же, что при подключении: пустой адрес приводится к строке и
 * отказывает тем же кодом. Тег самого сета занятым не считается.
 */
export function makeRuleSetEditSchema(takenTags: readonly string[], outbounds: readonly string[], ownTag: string) {
  return RuleSetEditSchema.transform((data) => ({ ...data, url: data.url ?? '' })).pipe(
    makeRuleSetAddSchema(
      takenTags.filter((tag) => tag !== ownTag),
      outbounds
    )
  );
}

function readText(node: Readonly<Record<string, unknown>>, key: string): string {
  const value = node[key];

  return typeof value === 'string' ? value : '';
}

/**
 * Форма открывается на узле как есть. Поставщик и категория формой правки не
 * выбираются: адрес правится целиком.
 */
export function ruleSetEditDefaults(node: Readonly<Record<string, unknown>>): RuleSetEditModel {
  return {
    providerId: CUSTOM_PROVIDER,
    kind: '',
    mirrorId: '',
    category: '',
    url: readText(node, 'url'),
    tag: readText(node, 'tag'),
    format: readText(node, 'format'),
    updateInterval: readText(node, 'update_interval'),
    detour: readText(node, 'download_detour'),
  };
}

/**
 * Узел после правки: поля формы поверх исходного узла. Пустое значение
 * удаляет ключ (`diffNode`), остальные ключи узла — `initial_path`, `http_client`
 * — не трогаются.
 */
export function toRuleSetEditNode(
  node: Readonly<Record<string, unknown>>,
  data: RuleSetAddModel
): Record<string, unknown> {
  return {
    ...node,
    tag: data.tag.trim(),
    url: data.url.trim(),
    format: data.format,
    update_interval: data.updateInterval.trim(),
    download_detour: data.detour.trim(),
  };
}
