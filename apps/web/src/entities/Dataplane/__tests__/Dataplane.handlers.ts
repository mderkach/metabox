import { http, HttpResponse } from 'msw';

import type { ApplyTransactionWire } from '@entities/Daemon/@x/dataplane';

import { DATAPLANE_ENDPOINT } from '../api/Dataplane.endpoints';
import type { DataplaneChangeWire, DataplaneWire } from '../api/Dataplane.schema';
import { DATAPLANE_FIXTURE } from './Dataplane.fixture';

/** Окно подтверждения демона — минута, в наносекундах `time.Duration`. */
const CONFIRM_WINDOW_NS = 60_000_000_000;

function isChange(body: unknown): body is DataplaneChangeWire {
  return typeof body === 'object' && body !== null && 'model' in body && typeof body.model === 'object';
}

/**
 * Модель обвязки вместе с циклом её смены. Транзакция уходит в статус демона
 * через `status()`: панель ищет идущую смену там, а ручку статуса держит мок
 * демона — вторая ручка с тем же адресом закрыла бы его транзакцию конфига.
 */
export function createDataplaneMock(initial: DataplaneWire = DATAPLANE_FIXTURE) {
  let dataplane = initial;
  let transaction: ApplyTransactionWire | null = null;

  return {
    status: () =>
      transaction === null
        ? {}
        : {
            dataplane_transaction: transaction,
            dataplane_transaction_href: DATAPLANE_ENDPOINT.applyState(transaction.id),
          },
    handlers: [
      http.get(DATAPLANE_ENDPOINT.dataplane(), () => HttpResponse.json(dataplane)),

      http.put(DATAPLANE_ENDPOINT.dataplane(), async ({ request }) => {
        const body: unknown = await request.json();

        if (!isChange(body)) {
          return HttpResponse.json({ code: 'dataplane_invalid', message: 'тело не разобрано' }, { status: 400 });
        }

        dataplane = { ...dataplane, model: body.model };
        transaction = { id: `dataplane-${String(Date.now())}`, phase: 'awaiting_confirm', window: CONFIRM_WINDOW_NS };

        return HttpResponse.json(transaction, { status: 202 });
      }),

      http.get(DATAPLANE_ENDPOINT.applyState(':id'), () =>
        transaction === null
          ? HttpResponse.json(
              { code: 'unknown_transaction', message: 'смены с таким идентификатором нет' },
              { status: 404 }
            )
          : HttpResponse.json(transaction)
      ),

      http.post(DATAPLANE_ENDPOINT.applyConfirm(':id'), () => {
        if (transaction === null) {
          return HttpResponse.json({ code: 'nothing_to_confirm', message: 'подтверждать нечего' }, { status: 409 });
        }

        transaction = { ...transaction, phase: 'confirmed', window: 0 };

        return HttpResponse.json(transaction);
      }),
    ],
  };
}
