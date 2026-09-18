import { z } from 'zod';

import { buildRuleSetURL, defaultFormatOf, RULE_SET_PROVIDERS, RULE_SET_TYPE, suggestTag } from '@entities/RuleSet';

import { HTTP_SCHEME, RULE_SET_ADD_ERROR } from './RuleSetAdd.constants';

/**
 * Что правит форма подключения.
 *
 * Источник, зеркало и категория — это способ собрать адрес, а в конфиг уходит
 * сам адрес: узнать по нему поставщика панель умеет и обратно (`describeURL`),
 * поэтому хранить выбор рядом с адресом незачем.
 */
export const RuleSetAddSchema = z.object({
  /** Поставщик из каталога; `custom` — адрес вписан руками */
  providerId: z.string(),
  /** Зеркало поставщика: до основного адреса дотягиваются не всегда */
  mirrorId: z.string(),
  /** Имя категории у поставщика */
  category: z.string(),
  /** Адрес, по которому ядро скачивает набор */
  url: z.string(),
  /** Имя набора: по нему на него ссылаются правила */
  tag: z.string(),
  /** Формат файла; пусто — ядро выведет его из расширения адреса */
  format: z.string(),
  /** Как часто перекачивать; пусто — ядро берёт сутки */
  updateInterval: z.string(),
  /** Через какой узел качать; пусто — напрямую */
  detour: z.string(),
});

export type RuleSetAddModel = z.infer<typeof RuleSetAddSchema>;

/**
 * Форма открывается на первом поставщике каталога, а не на пустом бланке:
 * «свой адрес» — запасной путь, и предлагать его первым значит начинать с
 * самого трудного.
 */
export function ruleSetAddDefaults(): RuleSetAddModel {
  const provider = RULE_SET_PROVIDERS[0];

  return {
    providerId: provider.id,
    mirrorId: provider.mirrors[0].id,
    category: '',
    url: '',
    tag: '',
    format: '',
    updateInterval: '',
    detour: '',
  };
}

/** Адрес и предложенный тег для выбранной категории. */
export function composeRuleSetURL(providerId: string, mirrorId: string, category: string): string {
  const provider = RULE_SET_PROVIDERS.find((item) => item.id === providerId);

  if (provider === undefined || category.trim() === '') {
    return '';
  }

  return buildRuleSetURL(provider, mirrorId, category.trim());
}

export function composeRuleSetTag(providerId: string, category: string): string {
  const provider = RULE_SET_PROVIDERS.find((item) => item.id === providerId);

  return provider === undefined ? '' : suggestTag(provider, category.trim());
}

/** Узел, который ляжет в `route.rule_set`. */
export interface RuleSetAddPatch {
  type: string;
  tag: string;
  url: string;
  format?: string;
  update_interval?: string;
  download_detour?: string;
}

/**
 * Схема с проверками, зависящими от документа: занятые теги приходят снаружи,
 * потому что тег — ссылка, по которой правило находит набор, и второй набор с
 * тем же именем сделал бы её двусмысленной.
 *
 * `format` требуется только тогда, когда адрес не даёт вывести его сам: поле,
 * равное выведенному значению, ядро при сохранении всё равно отбрасывает, а в
 * дифе оно выглядело бы правкой пользователя (AC-2).
 */
export function makeRuleSetAddSchema(takenTags: readonly string[]) {
  const taken = new Set(takenTags);

  return RuleSetAddSchema.superRefine((data, ctx) => {
    const url = data.url.trim();

    if (url === '') {
      ctx.addIssue({ code: 'custom', path: ['url'], message: RULE_SET_ADD_ERROR.UrlRequired });
    } else if (!HTTP_SCHEME.test(url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: RULE_SET_ADD_ERROR.UrlScheme });
    }

    const tag = data.tag.trim();

    if (tag === '') {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: RULE_SET_ADD_ERROR.TagRequired });
    } else if (taken.has(tag)) {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: RULE_SET_ADD_ERROR.TagTaken });
    }

    if (url !== '' && defaultFormatOf(url) === '' && data.format === '') {
      ctx.addIssue({ code: 'custom', path: ['format'], message: RULE_SET_ADD_ERROR.FormatRequired });
    }
  });
}

/** Собирает узел набора из заполненной формы. */
export function toRuleSetPatch(data: RuleSetAddModel): RuleSetAddPatch {
  const url = data.url.trim();
  const interval = data.updateInterval.trim();
  const detour = data.detour.trim();
  // Формат пишется, только когда из адреса он не выводится: иначе это значение
  // по умолчанию, которое ядро отбрасывает само.
  const format = defaultFormatOf(url) === '' ? data.format : '';

  return {
    type: RULE_SET_TYPE.Remote,
    tag: data.tag.trim(),
    url,
    ...(format !== '' && { format }),
    ...(interval !== '' && { update_interval: interval }),
    ...(detour !== '' && { download_detour: detour }),
  };
}
