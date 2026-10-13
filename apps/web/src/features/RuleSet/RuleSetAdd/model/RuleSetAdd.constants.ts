import type { ParseKeys } from 'i18next';

import { RULE_SET_FORMAT } from '@entities/RuleSet';

/**
 * Form failures as codes: the `ui` substitutes the text, because the slice
 * dictionary is its concern, and the schema knows nothing about language.
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

/** Failure code to a dictionary key: a missed translation is caught by compilation. */
export const RULE_SET_ADD_ERROR_KEY: Readonly<Record<string, ParseKeys<'features/RuleSet/RuleSetAdd'> | undefined>> = {
  [RULE_SET_ADD_ERROR.UrlRequired]: 'error.urlRequired',
  [RULE_SET_ADD_ERROR.UrlScheme]: 'error.urlScheme',
  [RULE_SET_ADD_ERROR.TagRequired]: 'error.tagRequired',
  [RULE_SET_ADD_ERROR.TagTaken]: 'error.tagTaken',
  [RULE_SET_ADD_ERROR.FormatRequired]: 'error.formatRequired',
  [RULE_SET_ADD_ERROR.IntervalFormat]: 'error.intervalFormat',
  [RULE_SET_ADD_ERROR.DetourUnknown]: 'error.detourUnknown',
};

/** Value of the "source" field when the address is typed by hand. */
export const CUSTOM_PROVIDER = 'custom';

/** Address core will go to the network by: only http and https. */
export const HTTP_SCHEME = /^https?:\/\/\S+$/u;

export const RULE_SET_FORMAT_OPTIONS = [RULE_SET_FORMAT.Binary, RULE_SET_FORMAT.Source] as const;

/**
 * How many hints to keep in the list: a provider has up to two thousand
 * categories, and there is no need to draw them all on every keystroke, since
 * the needed one is found by typing.
 */
export const SUGGESTION_LIMIT = 50;
