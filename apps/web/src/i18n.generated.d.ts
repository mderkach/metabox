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
      'features/Config/ConfigCacheFile': typeof import('./features/Config/ConfigCacheFile/i18n/ru.json');
      'features/Config/ConfigNodeAdd': typeof import('./features/Config/ConfigNodeAdd/i18n/ru.json');
      'features/Config/ConfigNodeForm': typeof import('./features/Config/ConfigNodeForm/i18n/ru.json');
      'features/Language/LanguageSwitch': typeof import('./features/Language/LanguageSwitch/i18n/ru.json');
      'features/Rule/RuleAdd': typeof import('./features/Rule/RuleAdd/i18n/ru.json');
      'features/Rule/RuleDelete': typeof import('./features/Rule/RuleDelete/i18n/ru.json');
      'features/Rule/RuleEdit': typeof import('./features/Rule/RuleEdit/i18n/ru.json');
      'features/Rule/RuleRaw': typeof import('./features/Rule/RuleRaw/i18n/ru.json');
      'features/Rule/RuleReorder': typeof import('./features/Rule/RuleReorder/i18n/ru.json');
      'features/RuleSet/RuleSetAdd': typeof import('./features/RuleSet/RuleSetAdd/i18n/ru.json');
      'features/RuleSet/RuleSetCustom': typeof import('./features/RuleSet/RuleSetCustom/i18n/ru.json');
      'features/Theme/ThemeSwitch': typeof import('./features/Theme/ThemeSwitch/i18n/ru.json');
      'pages/Connections': typeof import('./pages/Connections/i18n/ru.json');
      'pages/Editor': typeof import('./pages/Editor/i18n/ru.json');
      'pages/Overview': typeof import('./pages/Overview/i18n/ru.json');
      'pages/Proxies': typeof import('./pages/Proxies/i18n/ru.json');
      'pages/RawConfig': typeof import('./pages/RawConfig/i18n/ru.json');
      'pages/RuleSets': typeof import('./pages/RuleSets/i18n/ru.json');
      'pages/Section': typeof import('./pages/Section/i18n/ru.json');
      shared: typeof import('./shared/i18n/ru.json');
      'widgets/AppSidebar': typeof import('./widgets/AppSidebar/i18n/ru.json');
      'widgets/Config/ConfigBuildNotice': typeof import('./widgets/Config/ConfigBuildNotice/i18n/ru.json');
      'widgets/Config/ConfigNode': typeof import('./widgets/Config/ConfigNode/i18n/ru.json');
      'widgets/Config/ConfigRawEditor': typeof import('./widgets/Config/ConfigRawEditor/i18n/ru.json');
      'widgets/Config/ConfigSectionSettings': typeof import('./widgets/Config/ConfigSectionSettings/i18n/ru.json');
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
      'widgets/RuleSet/RuleSetTable': typeof import('./widgets/RuleSet/RuleSetTable/i18n/ru.json');
    };
  }
}
