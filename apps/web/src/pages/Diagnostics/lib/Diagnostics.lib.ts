import { SERVICE_GROUPS, type ProxyRuntime } from '@entities/Proxy';

/**
 * Where an outbound can be checked: groups, then nodes without repeats. Service
 * Clash API groups do not exist in the config, and an outbound through them says
 * nothing about the configured routing.
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
