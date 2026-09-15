/*
 * Карта неймспейсов i18next. Артефакт `tools/i18n.ts`, руками не правится.
 * Язык-источник типов — ru.
 */

import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      app: typeof import('./app/i18n/ru.json');
      'features/Config/ConfigApply': typeof import('./features/Config/ConfigApply/i18n/ru.json');
      'features/Language/LanguageSwitch': typeof import('./features/Language/LanguageSwitch/i18n/ru.json');
      'features/Rule/RuleEdit': typeof import('./features/Rule/RuleEdit/i18n/ru.json');
      'features/Rule/RuleRaw': typeof import('./features/Rule/RuleRaw/i18n/ru.json');
      'features/Theme/ThemeSwitch': typeof import('./features/Theme/ThemeSwitch/i18n/ru.json');
      'pages/Connections': typeof import('./pages/Connections/i18n/ru.json');
      'pages/Editor': typeof import('./pages/Editor/i18n/ru.json');
      'pages/Overview': typeof import('./pages/Overview/i18n/ru.json');
      'pages/Proxies': typeof import('./pages/Proxies/i18n/ru.json');
      'pages/RawConfig': typeof import('./pages/RawConfig/i18n/ru.json');
      shared: typeof import('./shared/i18n/ru.json');
      'widgets/AppSidebar': typeof import('./widgets/AppSidebar/i18n/ru.json');
      'widgets/Config/ConfigRawEditor': typeof import('./widgets/Config/ConfigRawEditor/i18n/ru.json');
      'widgets/Config/ConfigTabs': typeof import('./widgets/Config/ConfigTabs/i18n/ru.json');
      'widgets/ConnectionHistory': typeof import('./widgets/ConnectionHistory/i18n/ru.json');
      'widgets/ConnectionSummary': typeof import('./widgets/ConnectionSummary/i18n/ru.json');
      'widgets/ConnectionTable': typeof import('./widgets/ConnectionTable/i18n/ru.json');
      'widgets/Daemon/DaemonService': typeof import('./widgets/Daemon/DaemonService/i18n/ru.json');
      'widgets/Daemon/DaemonTraffic': typeof import('./widgets/Daemon/DaemonTraffic/i18n/ru.json');
      'widgets/ProxyGroups': typeof import('./widgets/ProxyGroups/i18n/ru.json');
      'widgets/ProxyLatency': typeof import('./widgets/ProxyLatency/i18n/ru.json');
      'widgets/RouteExplanation': typeof import('./widgets/RouteExplanation/i18n/ru.json');
      'widgets/Rule/RulePanel': typeof import('./widgets/Rule/RulePanel/i18n/ru.json');
      'widgets/Rule/RuleTable': typeof import('./widgets/Rule/RuleTable/i18n/ru.json');
    };
  }
}
