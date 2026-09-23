import type { ClashProvidersWire, ClashProxiesWire, ClashProxyWire } from '../api/Proxy.schema';
import {
  DELAY_STATE,
  DELAY_TIMEOUT,
  GROUP_TYPES,
  SERVICE_GROUPS,
  type DelayState,
  type ProxyGroup,
  type ProxyNode,
  type ProxyProvider,
  type ProxyRuntime,
} from './Proxy.model';

/** Граница «быстро» — порог, при котором переключение узла ещё не заметно. */
const FAST_DELAY = 300;

/** Тип селектора: единственная группа, где узел выбирает пользователь. */
const SELECTOR_TYPE = 'Selector';

function toDelay(proxy: ClashProxyWire): number | null {
  const last = proxy.history.at(-1);

  return last === undefined ? null : last.delay;
}

function toDelayState(delay: number | null): DelayState {
  if (delay === null) {
    return DELAY_STATE.Unknown;
  }

  if (delay >= DELAY_TIMEOUT || delay === 0) {
    return DELAY_STATE.Failed;
  }

  return delay <= FAST_DELAY ? DELAY_STATE.Fast : DELAY_STATE.Slow;
}

function toNode(proxy: ClashProxyWire, selected: boolean): ProxyNode {
  const delay = toDelay(proxy);

  return { name: proxy.name, type: proxy.type, delay, delayState: toDelayState(delay), selected };
}

/**
 * Группы конфига. Служебные `GLOBAL` и `DIRECT` отброшены: в файле их нет, а
 * переключение `GLOBAL` увело бы весь трафик мимо правил маршрутизации.
 *
 * Селекторы идут первыми: только в них узел переключают руками, а за
 * остальными группами экран лишь наблюдает. Внутри вида порядок рантайма
 * сохраняется.
 */
function toGroups(source: ClashProxiesWire): ProxyGroup[] {
  const groups: ProxyGroup[] = [];

  for (const proxy of Object.values(source.proxies)) {
    if (!GROUP_TYPES.has(proxy.type) || SERVICE_GROUPS.has(proxy.name)) {
      continue;
    }

    const now = proxy.now ?? null;
    const nodes: ProxyNode[] = [];

    for (const name of proxy.all ?? []) {
      // Группа перечисляет узел, которого в снапшоте нет: рантайм отдаёт `all`
      // из конфига, а узел мог приехать из подписки и ещё не загрузиться.
      if (!Object.hasOwn(source.proxies, name)) {
        continue;
      }

      const node = source.proxies[name];

      nodes.push(toNode(node, node.name === now));
    }

    groups.push({
      name: proxy.name,
      type: proxy.type,
      selectable: proxy.type === SELECTOR_TYPE,
      now,
      nodes,
    });
  }

  return [...groups.filter((group) => group.selectable), ...groups.filter((group) => !group.selectable)];
}

/**
 * Узлы вне групп — то, что показывает экран, когда групп в конфиге нет вовсе:
 * правила ссылаются прямо на аутбаунды, и переключать нечего.
 */
function toStandalone(source: ClashProxiesWire): ProxyNode[] {
  return Object.values(source.proxies)
    .filter((proxy) => !GROUP_TYPES.has(proxy.type) && !SERVICE_GROUPS.has(proxy.name))
    .map((proxy) => toNode(proxy, false));
}

/**
 * Снимок рантайма с другим выбранным узлом в группе. Неизвестная группа
 * возвращает снимок как есть: выбор в несуществующей группе — не ошибка
 * данных, а гонка с перечитыванием списка.
 */
export function withSelectedNode(proxies: ClashProxiesWire, group: string, node: string): ClashProxiesWire {
  if (!Object.hasOwn(proxies.proxies, group)) {
    return proxies;
  }

  return { proxies: { ...proxies.proxies, [group]: { ...proxies.proxies[group], now: node } } };
}

export function toProxyRuntime(wire: ClashProxiesWire): ProxyRuntime {
  return { groups: toGroups(wire), standalone: toStandalone(wire) };
}

export function toProxyProviders(wire: ClashProvidersWire): ProxyProvider[] {
  return Object.values(wire.providers).map((provider) => ({
    name: provider.name,
    nodes: provider.proxies.length,
    updatedAt: provider.updatedAt,
  }));
}
