import { http, HttpResponse } from 'msw';

import {
  OutboundMetadataEditSchema,
  type LatencyHistoryWire,
  type LatencyResultWire,
  type OutboundMetadataEditWire,
  type OutboundsWire,
} from '@shared/api/daemon.generated';

import { PROXY_ENDPOINT } from '../api/Proxy.endpoints';
import type { ClashProvidersWire, ClashProxiesWire } from '../api/Proxy.schema';
import { DELAY_TIMEOUT, GROUP_TYPES } from '../model/Proxy.model';
import { CLASH_DELAY_FIXTURE, CLASH_PROVIDERS_FIXTURE, CLASH_PROXIES_FIXTURE } from './Proxy.fixture';

/**
 * Any node in the path. A wildcard exactly, not `:name`: node addresses pass
 * through `encodeURIComponent`, and a colon in it would become `%3A`:
 * the handler would silently not match.
 */
const NODE_PATTERN = '*';

/** The node the dev mock keeps silent, so the "did not answer" state can be seen. */
const SILENT_NODE = 'sub-nl/nl-reality';
const RECENT_LATENCY_LIMIT = 10;

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

/**
 * What a manual update leaves in the dev mock, so the shrunk-set warning can be
 * seen: as the fork does, an update replaces the set even when the filters left
 * nothing. A subscription not listed keeps its nodes and gets a new update time.
 */
const UPDATED_NODES: Readonly<Record<string, number>> = { 'sub-nl': 1, 'sub-us': 0 };

/** Handlers that do not depend on state: both mock builds take them as is. */
function readOnlyHandlers() {
  return [http.get(PROXY_ENDPOINT.proxyDelay(NODE_PATTERN), () => HttpResponse.json(CLASH_DELAY_FIXTURE))];
}

/** Proxy handlers the daemon does not have yet: shapes taken from the device. */
export const proxyHandlers = [
  http.get(PROXY_ENDPOINT.outbounds(), () => HttpResponse.json({})),
  http.get(PROXY_ENDPOINT.latency(), () => HttpResponse.json({ servers: [] })),
  http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(CLASH_PROXIES_FIXTURE)),
  http.get(PROXY_ENDPOINT.providers(), () => HttpResponse.json(CLASH_PROVIDERS_FIXTURE)),
  http.put(PROXY_ENDPOINT.provider(NODE_PATTERN), () => new HttpResponse(null, { status: 204 })),
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
export function createStatefulProxyHandlers(
  initialProxies = CLASH_PROXIES_FIXTURE,
  initialProviders = CLASH_PROVIDERS_FIXTURE,
  initialMetadata: OutboundsWire = {}
) {
  const chosen = new Map<string, string>();
  const silent = new Set<string>();
  const measurements = new Map<string, LatencyResultWire[]>();
  const metadata = new Map(Object.entries(initialMetadata));

  function getMetadata(): OutboundsWire {
    return Object.fromEntries(
      [...metadata].map(([tag, entry]) => [
        tag,
        {
          ...(entry.label === undefined ? {} : { label: entry.label }),
          ...(entry.norm_ms === undefined ? {} : { norm_ms: entry.norm_ms }),
          ...(!Object.hasOwn(initialProxies.proxies, tag) ? { unused: true } : {}),
        },
      ])
    );
  }

  function rememberMetadata(tag: string, entry: OutboundMetadataEditWire): void {
    if (entry.label === undefined && entry.norm_ms === undefined) {
      metadata.delete(tag);
    } else {
      metadata.set(tag, entry);
    }
  }
  /** Subscription → the time of its last manual update. */
  const updated = new Map<string, string>();

  // The mock answers in the wire shape, so the selection is set right in it:
  // the model `withSelectedNode` works with groups that do not exist here yet.
  function snapshot(): ClashProxiesWire {
    const proxies = { ...initialProxies.proxies };

    for (const [group, node] of chosen) {
      if (Object.hasOwn(proxies, group)) {
        proxies[group] = { ...proxies[group], now: node };
      }
    }

    for (const node of silent) {
      proxies[node] = { ...proxies[node], history: [] };
    }

    return { proxies };
  }

  function record(tag: string, delay?: number): void {
    const point = { at: new Date().toISOString(), ...(delay === undefined ? {} : { delay_ms: delay }) };
    measurements.set(tag, [...(measurements.get(tag) ?? []), point].slice(-RECENT_LATENCY_LIMIT));
  }

  function latency(): LatencyHistoryWire {
    return {
      servers: Object.values(initialProxies.proxies)
        .filter((proxy) => !GROUP_TYPES.has(proxy.type) && proxy.type !== 'Direct')
        .map((proxy) => {
          const manual = measurements.get(proxy.name) ?? [];
          const current = manual.at(-1);
          const knownDelay = proxy.history.at(0)?.delay;
          const computed = knownDelay !== undefined && knownDelay < DELAY_TIMEOUT ? knownDelay : undefined;
          const usual = metadata.get(proxy.name)?.norm_ms ?? computed;
          const recent = [
            ...proxy.history.map((point) => ({
              at: point.time,
              ...(point.delay < DELAY_TIMEOUT ? { delay_ms: point.delay } : {}),
            })),
            ...manual,
          ].slice(-RECENT_LATENCY_LIMIT);
          let level = 'no_measurement';

          if (current !== undefined) {
            level = current.delay_ms === undefined ? 'no_answer' : 'within_norm';
          }

          return {
            tag: proxy.name,
            ...(current === undefined ? {} : { current }),
            ...(usual === undefined ? {} : { usual_ms: usual }),
            ...(computed === undefined ? {} : { computed_usual_ms: computed }),
            recent,
            hourly: [],
            level,
            origin: 'computed',
          };
        }),
    };
  }

  function providers(): ClashProvidersWire {
    const result = { ...initialProviders.providers };

    for (const [name, updatedAt] of updated) {
      if (Object.hasOwn(result, name)) {
        const provider = result[name];
        const nodes = UPDATED_NODES[name] ?? provider.proxies.length;

        result[name] = { ...provider, updatedAt, proxies: provider.proxies.slice(0, nodes) };
      }
    }

    return { providers: result };
  }

  return [
    http.get(PROXY_ENDPOINT.outbounds(), () => HttpResponse.json(getMetadata())),
    http.put(`${PROXY_ENDPOINT.outbounds()}/:tag`, async ({ request }) => {
      const entry = OutboundMetadataEditSchema.safeParse(await request.json());
      if (!entry.success) {
        return HttpResponse.json({ code: 'outbound_invalid' }, { status: 400 });
      }

      rememberMetadata(toGroupName(request.url), entry.data);

      return HttpResponse.json(getMetadata());
    }),
    http.get(PROXY_ENDPOINT.latency(), () => HttpResponse.json(latency())),
    http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json(snapshot())),
    http.get(PROXY_ENDPOINT.providers(), () => HttpResponse.json(providers())),
    http.put(PROXY_ENDPOINT.provider(NODE_PATTERN), function rememberUpdate({ request }) {
      updated.set(toGroupName(request.url), new Date().toISOString());

      return new HttpResponse(null, { status: 204 });
    }),

    // One node never answers, as the fork reports it: an error status, and the history is dropped.
    http.get(PROXY_ENDPOINT.proxyDelay(SILENT_NODE), () => {
      silent.add(SILENT_NODE);
      record(SILENT_NODE);

      return HttpResponse.json({ message: 'An error occurred in the delay test' }, { status: 503 });
    }),
    http.get(PROXY_ENDPOINT.proxyDelay(NODE_PATTERN), ({ request }) => {
      const path = new URL(request.url).pathname;
      const tag = toGroupName(new URL(path.slice(0, -'/delay'.length), request.url).href);
      record(tag, CLASH_DELAY_FIXTURE.delay);

      return HttpResponse.json(CLASH_DELAY_FIXTURE);
    }),

    http.put(PROXY_ENDPOINT.proxy(NODE_PATTERN), async function rememberSelect({ request }) {
      const node = toChosenNode(await request.json());

      if (node !== null) {
        chosen.set(toGroupName(request.url), node);
      }

      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
