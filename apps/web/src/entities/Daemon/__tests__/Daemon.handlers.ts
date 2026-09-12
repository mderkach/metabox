import { http, HttpResponse } from 'msw';

import { CONFIG_ENDPOINT } from '@entities/Config';

import { DAEMON_ENDPOINT } from '../api/Daemon.endpoints';
import type { ApplyTransactionWire } from '../api/Daemon.schema';
import { CLASH_CONFIGS_FIXTURE, DAEMON_STATUS_FIXTURE, SERVICE_RUNNING_FIXTURE } from './Daemon.fixture';

/** Окно подтверждения демона — минута (NFR-5), в наносекундах `time.Duration`. */
const CONFIRM_WINDOW_NS = 60_000_000_000;

/**
 * Моки демона вместе с циклом применения.
 *
 * Транзакция держится состоянием и уходит в `GET /api/status`: панель ищет
 * идущее применение именно там, и мок без состояния показывал бы окно
 * подтверждения, которое ничем не закрывается. Ручка отката версии живёт здесь
 * же, хотя адрес у неё конфиговый: она запускает ту же транзакцию, а разводить
 * её по двум мокам значило бы держать два независимых состояния одного цикла.
 */
export function createStatefulDaemonHandlers() {
  let transaction: ApplyTransactionWire | null = null;

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
      HttpResponse.json(
        transaction === null
          ? DAEMON_STATUS_FIXTURE
          : { ...DAEMON_STATUS_FIXTURE, transaction, transaction_href: `/api/apply/${transaction.id}` }
      )
    ),

    http.post(DAEMON_ENDPOINT.apply(), () => HttpResponse.json(start(), { status: 202 })),
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

    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.post(DAEMON_ENDPOINT.serviceAction(':action'), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
  ];
}
