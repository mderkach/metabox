import type { ParseKeys } from 'i18next';

import { RULE_SET_FORMAT } from '@entities/RuleSet';

/**
 * Отказы формы кодами: текст подставляет `ui`, потому что словарь слайса — его
 * забота, а схема о языке ничего не знает.
 */
export const RULE_SET_ADD_ERROR = {
  UrlRequired: 'urlRequired',
  UrlScheme: 'urlScheme',
  TagRequired: 'tagRequired',
  TagTaken: 'tagTaken',
  FormatRequired: 'formatRequired',
  IntervalFormat: 'intervalFormat',
  DetourUnknown: 'detourUnknown',
} as const;

/** Код отказа в ключ словаря: пропущенный перевод ловится компиляцией. */
export const RULE_SET_ADD_ERROR_KEY: Readonly<Record<string, ParseKeys<'features/RuleSet/RuleSetAdd'> | undefined>> = {
  [RULE_SET_ADD_ERROR.UrlRequired]: 'error.urlRequired',
  [RULE_SET_ADD_ERROR.UrlScheme]: 'error.urlScheme',
  [RULE_SET_ADD_ERROR.TagRequired]: 'error.tagRequired',
  [RULE_SET_ADD_ERROR.TagTaken]: 'error.tagTaken',
  [RULE_SET_ADD_ERROR.FormatRequired]: 'error.formatRequired',
  [RULE_SET_ADD_ERROR.IntervalFormat]: 'error.intervalFormat',
  [RULE_SET_ADD_ERROR.DetourUnknown]: 'error.detourUnknown',
};

/** Значение поля «источник», когда адрес вписан руками. */
export const CUSTOM_PROVIDER = 'custom';

/** Адрес, по которому ядро пойдёт в сеть: только http и https. */
export const HTTP_SCHEME = /^https?:\/\/\S+$/u;

export const RULE_SET_FORMAT_OPTIONS = [RULE_SET_FORMAT.Binary, RULE_SET_FORMAT.Source] as const;

/**
 * Сколько подсказок держать в списке: у поставщика до двух тысяч категорий, и
 * рисовать их все на каждое нажатие клавиши незачем — нужное находится вводом.
 */
export const SUGGESTION_LIMIT = 50;
