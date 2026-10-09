import { SERVICE_GROUPS, type ProxyRuntime } from '@entities/Proxy';

/**
 * Куда можно проверить выход: группы, затем узлы без повторов. Служебные
 * группы Clash API в конфиге не существуют, и выход через них ничего не
 * говорит о настроенной маршрутизации.
 */
export function toDiagTargets(runtime: ProxyRuntime | undefined): string[] {
  if (runtime === undefined) {
    return [];
  }

  const names = [
    ...runtime.groups.map((group) => group.name),
    ...runtime.groups.flatMap((group) => group.nodes.map((node) => node.name)),
    ...runtime.standalone.map((node) => node.name),
  ];

  return [...new Set(names)].filter((name) => !SERVICE_GROUPS.has(name));
}
