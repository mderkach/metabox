import { http, HttpResponse } from 'msw';

import { PROXY_ENDPOINT } from '../api/Proxy.endpoints';
import type { ClashProxiesWire } from '../api/Proxy.schema';
import { CLASH_DELAY_FIXTURE, CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

/**
 * Any node in the path. A wildcard exactly, not `:name`: node addresses pass
 * through `encodeURIComponent`, and a colon in it would become `%3A`:
 * the handler would silently not match.
 */
const NODE_PATTERN = '*';

/** Group name from the address: in the path it is encoded, and the state key must be the original. */
function toGroupName(url: string): string {
  const path = new URL(url).pathname;

  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
}

/** Node from the runtime request body: `{ "name": "sub-eu/eu-reality" }`. */
function toChosenNode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return null;
  }

  return typeof body.name === 'string' ? body.name : null;
}

/** Handlers that do not depend on state: both mock builds take them as is. */
function readOnlyHandlers() {
  return [
    http.get(PROXY_ENDPOINT.providers(), () => HttpResponse.json(CLASH_PROVIDERS_FIXTURE)),
    http.get(PROXY_ENDPOINT.proxyDelay(NODE_PATTERN), () => HttpResponse.json(CLASH_DELAY_FIXTURE)),
    http.put(PROXY_ENDPOINT.provider(NODE_PATTERN), () => new HttpResponse(null, { status: 204 })),
  ];
}

/** Proxy handlers the daemon does not have yet: shapes taken from the device. */
export const proxyHandlers = [
  http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(CLASH_PROXIES_FIXTURE)),
  ...readOnlyHandlers(),

  // The runtime answers a node selection with an empty body: the panel takes the new state
  // from the list refetch, not from the response.
  http.put(PROXY_ENDPOINT.proxy(NODE_PATTERN), () => new HttpResponse(null, { status: 204 })),
];

/**
 * The same, but the node selection is remembered until the page reloads: without this
 * a switch in a selector group is visible for a second, and then the list refetch
 * returns the node from the fixture, and dev mode looks broken.
 *
 * State lives in the factory closure, so it cannot get into tests:
 * they use `proxyHandlers`, which has no state of its own.
 */
export function createStatefulProxyHandlers() {
  const chosen = new Map<string, string>();

  // The mock answers in the wire shape, so the selection is set right in it:
  // the model `withSelectedNode` works with groups that do not exist here yet.
  function snapshot(): ClashProxiesWire {
    const proxies = { ...CLASH_PROXIES_FIXTURE.proxies };

    for (const [group, node] of chosen) {
      if (Object.hasOwn(proxies, group)) {
        proxies[group] = { ...proxies[group], now: node };
      }
    }

    return { proxies };
  }

  return [
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(snapshot())),
    ...readOnlyHandlers(),

    http.put(PROXY_ENDPOINT.proxy(NODE_PATTERN), async function rememberSelect({ request }) {
      const node = toChosenNode(await request.json());

      if (node !== null) {
        chosen.set(toGroupName(request.url), node);
      }

      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
