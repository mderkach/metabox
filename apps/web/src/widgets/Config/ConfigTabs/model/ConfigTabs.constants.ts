import type { ParseKeys } from 'i18next';

import { CONFIG_SECTION, type ConfigSection } from '@entities/Config';

/**
 * Секции конфига в том же порядке, в каком они лежат в файле, — так вкладка
 * находится по памяти о `config.json`, а не по алфавиту.
 *
 * `route` у секции без экрана нет: вкладка-заглушка, ведущая в никуда, хуже
 * видимой недоступной — по ней непонятно, что раздела ещё не сделали.
 */
export const CONFIG_TABS = [
  { key: CONFIG_SECTION.Route, label: 'section.route', route: '/config' },
  { key: CONFIG_SECTION.RuleSet, label: 'section.ruleSet', route: '/config/rule-set' },
  { key: CONFIG_SECTION.Inbounds, label: 'section.inbounds', route: null },
  { key: CONFIG_SECTION.Outbounds, label: 'section.outbounds', route: null },
  { key: CONFIG_SECTION.Providers, label: 'section.providers', route: null },
  { key: CONFIG_SECTION.Dns, label: 'section.dns', route: null },
  { key: CONFIG_SECTION.Log, label: 'section.log', route: null },
  { key: CONFIG_SECTION.Experimental, label: 'section.experimental', route: null },
] as const satisfies ReadonlyArray<{
  key: ConfigSection;
  label: ParseKeys<'widgets/Config/ConfigTabs'>;
  route: '/config' | '/config/rule-set' | null;
}>;

export const CONFIG_TAB_CLASS =
  'relative mb-1 inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap';

/** Полоса под выбранным разделом: второй признак выбора помимо цвета. */
export const CONFIG_TAB_UNDERLINE = 'absolute inset-x-0 -bottom-1.5 h-0.5 bg-foreground';
