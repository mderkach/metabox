import { http, HttpResponse } from 'msw';

import type { ApplyTransactionWire } from '@entities/Daemon/@x/dataplane';
import { MS_IN_MINUTE, NS_IN_SECOND, SECONDS_IN_MINUTE } from '@shared/lib/time';

import { DATAPLANE_ENDPOINT } from '../api/Dataplane.endpoints';
import type { DataplaneChangeWire, DataplaneWire } from '../api/Dataplane.schema';
import { DATAPLANE_FIXTURE } from './Dataplane.fixture';

/** The daemon confirmation window is a minute, in nanoseconds of `time.Duration`. */
const CONFIRM_WINDOW_NS = SECONDS_IN_MINUTE * NS_IN_SECOND;

function isChange(body: unknown): body is DataplaneChangeWire {
  return typeof body === 'object' && body !== null && 'model' in body && typeof body.model === 'object';
}

/**
 * Dataplane model together with its change cycle. The transaction goes into the daemon status
 * through `status()`: the panel looks for the running change there, and the status handler is held by the daemon
 * mock: a second handler with the same address would close its config transaction.
 * `edit` changes the section behind the panel, like a UCI edit over SSH: `ETag` changes, and
 * a change with the old `If-Match` gets 412.
 */
export function createDataplaneMock(initial: DataplaneWire = DATAPLANE_FIXTURE) {
  let dataplane = initial;
  let revision = 1;
  let nextRevision = revision;
  let transaction: ApplyTransactionWire | null = null;
  let pending: { previous: DataplaneWire; revision: number; deadline: number } | null = null;

  const etag = () => `"dataplane-${String(revision)}"`;
  const expire = () => {
    if (pending === null || transaction === null || Date.now() < pending.deadline) return;

    dataplane = pending.previous;
    revision = pending.revision;
    pending = null;
    transaction = { ...transaction, phase: 'rolled_back', window: 0 };
  };

  return {
    edit: (model: DataplaneWire['model']) => {
      dataplane = { ...dataplane, model };
      revision = ++nextRevision;
    },
    status: () => {
      expire();

      return transaction === null
        ? {}
        : {
            dataplane_transaction: transaction,
            dataplane_transaction_href: DATAPLANE_ENDPOINT.applyState(transaction.id),
          };
    },
    handlers: [
      http.get(DATAPLANE_ENDPOINT.dataplane(), () => {
        expire();

        return HttpResponse.json(dataplane, { headers: { ETag: etag() } });
      }),

      http.put(DATAPLANE_ENDPOINT.dataplane(), async ({ request }) => {
        const match = request.headers.get('If-Match');

        if (match === null) {
          return HttpResponse.json({ code: 'dataplane_modified', message: 'нужен If-Match' }, { status: 428 });
        }

        if (match !== etag()) {
          return HttpResponse.json(
            { code: 'dataplane_modified', message: 'модель обвязки изменена вне metabox' },
            { status: 412 }
          );
        }

        const body: unknown = await request.json();

        if (!isChange(body)) {
          return HttpResponse.json({ code: 'dataplane_invalid', message: 'тело не разобрано' }, { status: 400 });
        }

        pending = { previous: dataplane, revision, deadline: Date.now() + MS_IN_MINUTE };
        dataplane = { ...dataplane, model: body.model };
        revision = ++nextRevision;
        transaction = { id: `dataplane-${String(Date.now())}`, phase: 'awaiting_confirm', window: CONFIRM_WINDOW_NS };

        return HttpResponse.json(transaction, { status: 202 });
      }),

      http.get(DATAPLANE_ENDPOINT.applyState(':id'), () => {
        expire();

        return transaction === null
          ? HttpResponse.json(
              { code: 'unknown_transaction', message: 'смены с таким идентификатором нет' },
              { status: 404 }
            )
          : HttpResponse.json(transaction);
      }),

      http.post(DATAPLANE_ENDPOINT.applyConfirm(':id'), () => {
        expire();

        if (transaction?.phase !== 'awaiting_confirm') {
          return HttpResponse.json({ code: 'nothing_to_confirm', message: 'подтверждать нечего' }, { status: 409 });
        }

        pending = null;
        transaction = { ...transaction, phase: 'confirmed', window: 0 };

        return HttpResponse.json(transaction);
      }),
    ],
  };
}
