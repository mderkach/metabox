import { http, HttpResponse } from 'msw';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { parseJsonc } from '@shared/lib/jsonc';

import { DAEMON_ENDPOINT } from '../api/Daemon.endpoints';
import type { ApplyTransactionWire, DaemonStatusWire, ServiceStateWire } from '../api/Daemon.schema';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from './Daemon.fixture';

/** The daemon confirmation window is a minute, in nanoseconds of `time.Duration`. */
const CONFIRM_WINDOW_NS = 60_000_000_000;

/** Apply envelope type: the daemon reads the config from its `config` field. */
const APPLY_ENVELOPE_TYPE = 'application/vnd.metabox.apply+json';

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The daemon's answer to a config text, in the same order it checks: first that the text starts
 * with an object, then that it parses. The dialect is the one the panel parses the config with.
 * The parser keeps the part it read before a syntax error, so a broken text that starts with an
 * object still reads as one.
 */
function configFailure(text: string): { code: string; message: string } | null {
  const { value, failure } = parseJsonc(text);

  if (!isObject(value)) {
    return { code: 'config_not_object', message: 'конфиг должен быть объектом JSON' };
  }

  return failure === null ? null : { code: 'config_not_json', message: 'конфиг не является корректным JSON' };
}

/** The config text of an apply body, or `null` when an envelope carries none. */
async function readApplyConfig(request: Request): Promise<string | null> {
  const text = await request.text();

  if (!(request.headers.get('content-type') ?? '').startsWith(APPLY_ENVELOPE_TYPE)) {
    return text;
  }

  const { value } = parseJsonc(text);
  const config = typeof value === 'object' && value !== null && 'config' in value ? value.config : null;

  return typeof config === 'string' ? config : null;
}

/**
 * Daemon mocks together with the apply cycle.
 *
 * The transaction is held as state and goes into `GET /api/status`: the panel looks for
 * the running apply exactly there, and a stateless mock would show a confirmation
 * window that nothing closes. The version rollback handler lives here
 * too, although its address is a config one: it starts the same transaction, and splitting
 * it across two mocks would mean keeping two independent states of one cycle.
 *
 * `extraStatus` appends fields of a foreign mock to the status: a dataplane model change:
 * the status address is one, and this mock holds it.
 */
export function createStatefulDaemonHandlers(
  extraStatus: () => Partial<DaemonStatusWire> = () => ({}),
  service: ServiceStateWire = SERVICE_RUNNING_FIXTURE
) {
  let transaction: ApplyTransactionWire | null = null;
  let clashConfigs = CLASH_CONFIGS_FIXTURE;
  // A restart answers at once and the next status carries a new process.
  let instance = DAEMON_STATUS_FIXTURE.instance;

  const start = (): ApplyTransactionWire => {
    transaction = {
      id: `mock-${String(Date.now())}`,
      phase: 'awaiting_confirm',
      window: CONFIRM_WINDOW_NS,
      clash_api_added: true,
    };

    return transaction;
  };

  return [
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({
        ...(transaction === null
          ? DAEMON_STATUS_FIXTURE
          : { ...DAEMON_STATUS_FIXTURE, transaction, transaction_href: `/api/apply/${transaction.id}` }),
        instance,
        ...extraStatus(),
      })
    ),

    // Like the daemon, a body that is not a config object is rejected: a mock that takes
    // anything hides a request the panel built wrongly.
    http.post(DAEMON_ENDPOINT.apply(), async ({ request }) => {
      const config = await readApplyConfig(request);

      const rejected = configFailure(config ?? '');

      if (rejected !== null) {
        return HttpResponse.json(rejected, { status: 400 });
      }

      return HttpResponse.json(start(), { status: 202 });
    }),
    http.post(`${CONFIG_ENDPOINT.versions()}/:id/restore`, () => HttpResponse.json(start(), { status: 202 })),

    http.get(DAEMON_ENDPOINT.applyState(':id'), () =>
      transaction === null
        ? HttpResponse.json(
            { code: 'unknown_transaction', message: 'транзакции с таким идентификатором нет' },
            { status: 404 }
          )
        : HttpResponse.json(transaction)
    ),

    http.post(DAEMON_ENDPOINT.applyConfirm(':id'), () => {
      if (transaction === null) {
        return HttpResponse.json({ code: 'nothing_to_confirm', message: 'подтверждать нечего' }, { status: 409 });
      }

      transaction = { ...transaction, phase: 'confirmed', window: 0 };

      return HttpResponse.json(transaction);
    }),

    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(service)),
    http.post(DAEMON_ENDPOINT.serviceAction(':action'), () => HttpResponse.json(service)),
    http.post(DAEMON_ENDPOINT.restart(), () => {
      instance = `mock-${String(Date.now())}`;

      return new HttpResponse(null, { status: 202 });
    }),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(clashConfigs)),
    http.patch(DAEMON_ENDPOINT.clashConfigs(), async ({ request }) => {
      const body: unknown = await request.json();
      const mode = typeof body === 'object' && body !== null && 'mode' in body ? String(body.mode) : '';

      // Like sing-box, an unknown mode is skipped silently, the response is 204 anyway.
      if (clashConfigs['mode-list'].includes(mode)) {
        clashConfigs = { ...clashConfigs, mode };
      }

      return new HttpResponse(null, { status: 204 });
    }),
    http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE)),
  ];
}
