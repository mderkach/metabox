import { http, HttpResponse } from 'msw';

import { API_ENDPOINT } from '@shared/api';

import type { ClashProxies } from '../api/Proxy.dto';
import { withSelectedNode } from '../model/Proxy.mapper';
import { CLASH_DELAY_FIXTURE, CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

/**
 * Любой узел в пути. Именно звёздочка, а не `:name`: адреса узлов проходят
 * через `encodeURIComponent`, и двоеточие в нём превратилось бы в `%3A` —
 * хендлер молча не совпал бы.
 */
const NODE_PATTERN = '*';

/** Имя группы из адреса: в пути оно закодировано, а ключом состояния должно быть исходное. */
function toGroupName(url: string): string {
  const path = new URL(url).pathname;

  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
}

/** Узел из тела запроса рантайма: `{ "name": "sub-eu/eu-reality" }`. */
function toChosenNode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return null;
  }

  return typeof body.name === 'string' ? body.name : null;
}

/** Ручки, которые от состояния не зависят: обе сборки моков берут их как есть. */
function readOnlyHandlers() {
  return [
    http.get(API_ENDPOINT.clashProviders(), () => HttpResponse.json(CLASH_PROVIDERS_FIXTURE)),
    http.get(API_ENDPOINT.clashProxyDelay(NODE_PATTERN), () => HttpResponse.json(CLASH_DELAY_FIXTURE)),
  ];
}

/** Ручки прокси, которых у демона ещё нет: формы сняты с устройства. */
export const proxyHandlers = [
  http.get(API_ENDPOINT.clashProxies(), () => HttpResponse.json(CLASH_PROXIES_FIXTURE)),
  ...readOnlyHandlers(),

  // Рантайм на выбор узла отвечает пустым телом: панель берёт новое состояние
  // из перезапроса списка, а не из ответа.
  http.put(API_ENDPOINT.clashProxy(NODE_PATTERN), () => new HttpResponse(null, { status: 204 })),
];

/**
 * То же, но выбор узла запоминается до перезагрузки страницы: без этого
 * переключение в группе-селекторе видно секунду, а потом перезапрос списка
 * возвращает узел из фикстуры, и дев-режим выглядит сломанным.
 *
 * Состояние живёт в замыкании фабрики, поэтому в тесты попасть не может:
 * там подключается `proxyHandlers`, у которого своего состояния нет.
 */
export function createStatefulProxyHandlers() {
  const chosen = new Map<string, string>();

  function snapshot(): ClashProxies {
    let proxies = CLASH_PROXIES_FIXTURE;

    for (const [group, node] of chosen) {
      proxies = withSelectedNode(proxies, group, node);
    }

    return proxies;
  }

  return [
    http.get(API_ENDPOINT.clashProxies(), () => HttpResponse.json(snapshot())),
    ...readOnlyHandlers(),

    http.put(API_ENDPOINT.clashProxy(NODE_PATTERN), async function rememberSelect({ request }) {
      const node = toChosenNode(await request.json());

      if (node !== null) {
        chosen.set(toGroupName(request.url), node);
      }

      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
