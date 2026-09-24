import { z } from 'zod';

import {
  buildRuleSetURL,
  defaultFormatOf,
  parseDuration,
  RULE_SET_LIST_KIND,
  RULE_SET_TYPE,
  suggestTag,
  type RuleSetCatalog,
  type RuleSetList,
} from '@entities/RuleSet';

import { CUSTOM_PROVIDER, HTTP_SCHEME, RULE_SET_ADD_ERROR } from './RuleSetAdd.constants';

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
  /** Вид списка у поставщика: домены или адреса */
  kind: z.string(),
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
 * Форма открывается на первом поставщике каталога и его списке доменов, а не
 * на пустом бланке: «свой адрес» — запасной путь, и предлагать его первым
 * значит начинать с самого трудного. Пустой каталог оставляет только его.
 */
export function ruleSetAddDefaults(catalog: RuleSetCatalog): RuleSetAddModel {
  const provider = catalog.providers.at(0);
  const list = provider?.lists.find((item) => item.kind === RULE_SET_LIST_KIND.Geosite) ?? provider?.lists.at(0);

  return {
    providerId: provider?.id ?? CUSTOM_PROVIDER,
    kind: list?.kind ?? RULE_SET_LIST_KIND.Geosite,
    mirrorId: list?.mirrors.at(0)?.id ?? '',
    category: '',
    url: '',
    tag: '',
    format: '',
    updateInterval: '',
    detour: '',
  };
}

/** Адрес набора для выбранной категории; без списка или категории — пусто. */
export function composeRuleSetURL(list: RuleSetList | null, mirrorId: string, category: string): string {
  if (list === null || category.trim() === '') {
    return '';
  }

  return buildRuleSetURL(list, mirrorId, category.trim());
}

/** Тег, который форма предлагает для категории. */
export function composeRuleSetTag(list: RuleSetList | null, category: string): string {
  return list === null ? '' : suggestTag(list, category.trim());
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
 * Схема с проверками, зависящими от документа: занятые теги и теги аутбаундов
 * приходят снаружи. Тег — ссылка, по которой правило находит набор, и второй
 * набор с тем же именем сделал бы её двусмысленной; узел, через который набор
 * качается, обязан существовать — иначе опечатка доезжает до устройства и
 * обрывает старт sing-box.
 *
 * Пустой список аутбаундов ничего не запрещает: он означает, что конфиг не
 * разобран, а не что узлов в нём нет.
 *
 * `format` требуется только тогда, когда адрес не даёт вывести его сам: поле,
 * равное выведенному значению, ядро при сохранении всё равно отбрасывает, а в
 * дифе оно выглядело бы правкой пользователя.
 */
export function makeRuleSetAddSchema(takenTags: readonly string[], outbounds: readonly string[] = []) {
  const taken = new Set(takenTags);
  const known = new Set(outbounds);

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

    const interval = data.updateInterval.trim();

    if (interval !== '' && parseDuration(interval) === null) {
      ctx.addIssue({ code: 'custom', path: ['updateInterval'], message: RULE_SET_ADD_ERROR.IntervalFormat });
    }

    const detour = data.detour.trim();

    if (detour !== '' && known.size > 0 && !known.has(detour)) {
      ctx.addIssue({ code: 'custom', path: ['detour'], message: RULE_SET_ADD_ERROR.DetourUnknown });
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
