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

/**
 * Секция без экрана. Не приглушённая вкладка, а другой класс элемента: метка
 * «скоро» рядом с именем говорит то, чего приглушённостью не скажешь, а полный
 * тон оставляет читаемым счётчик, который она несёт.
 */
export const CONFIG_TAB_SOON = 'rounded-sm bg-muted px-1 text-2xs tracking-wide text-muted-foreground uppercase';

/**
 * Полоса под выбранным разделом: второй признак выбора помимо цвета.
 *
 * Имя View Transitions одно на всю навигацию: полоса показана только под
 * текущим разделом, и при смене раздела переезжает под новый.
 */
export const CONFIG_TAB_UNDERLINE =
  'absolute inset-x-0 -bottom-1.5 h-0.5 bg-foreground [view-transition-name:config-tab-underline]';

export const CONFIG_MODE_ROUTE = {
  Forms: '/config',
  Text: '/config/raw',
} as const;

export type ConfigModeRoute = (typeof CONFIG_MODE_ROUTE)[keyof typeof CONFIG_MODE_ROUTE];

/**
 * Вторая ось полосы: чем документ показан. Секции отвечают на «какую часть
 * смотрю», режим — на «формами или текстом». Текст показывает файл целиком,
 * поэтому в нём ни одна секция не выбрана, а возврат к формам ведёт на первую.
 */
export const CONFIG_MODES = [
  { key: 'forms', label: 'mode.forms', route: CONFIG_MODE_ROUTE.Forms },
  { key: 'text', label: 'mode.text', route: CONFIG_MODE_ROUTE.Text },
] as const satisfies ReadonlyArray<{
  key: string;
  label: ParseKeys<'widgets/Config/ConfigTabs'>;
  route: ConfigModeRoute;
}>;

/** Сегментированный переключатель режима: группа и её кнопки. */
export const CONFIG_MODE_GROUP = 'inline-flex h-6 shrink-0 items-center rounded-lg border border-border p-0.5';

export const CONFIG_MODE_ITEM =
  'inline-flex h-5 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';

export const CONFIG_MODE_ACTIVE = 'bg-selected text-foreground';
export const CONFIG_MODE_IDLE = 'text-muted-foreground hover:text-foreground';
