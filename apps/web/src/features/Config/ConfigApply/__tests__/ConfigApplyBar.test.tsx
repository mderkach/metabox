import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { ConfigApplyBar } from '../ui/ConfigApplyBar';

const APPLIED = '{\n  "log": { "level": "info" }\n}';
const DRAFT = '{\n  "log": { "level": "debug" }\n}';

const CONFIRM_WINDOW_NS = 60_000_000_000;

const TRANSACTION = {
  id: 'tx-1',
  phase: 'awaiting_confirm',
  window: CONFIRM_WINDOW_NS,
  sha256: 'a'.repeat(64),
};

function serveStatus(transaction?: unknown) {
  server.use(http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, transaction })));
}

const POLL_STEP = 50;
const POLL_LIMIT = 6000;
const REAL_YIELD = 1;
/** Снято до подмены таймеров: ответы моков и отложенный рендер React идут вне фейковых часов. */
const waitReal = globalThis.setTimeout;

/** Двигает фейковые часы шагами, отдавая между ними такт настоящим. */
async function advanceUntil(happened: () => boolean): Promise<void> {
  for (let waited = 0; waited < POLL_LIMIT && !happened(); waited += POLL_STEP) {
    await vi.advanceTimersByTimeAsync(POLL_STEP);
    await new Promise<void>((resolve) => {
      waitReal(resolve, REAL_YIELD);
    });
  }
}

function loadDocument(draft = true) {
  ConfigDocumentState.getState().load(APPLIED);

  if (draft) ConfigDocumentState.getState().replace(DRAFT);
}

describe('ConfigApplyBar', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    serveStatus();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('молчит, пока правок нет и применение не идёт', () => {
    loadDocument(false);
    renderWithQuery(<ConfigApplyBar />);

    expect(screen.queryByRole('region', { name: 'Применение конфига' })).not.toBeInTheDocument();
  });

  it('на черновике предлагает применить и посмотреть диф', () => {
    loadDocument();
    renderWithQuery(<ConfigApplyBar />);

    expect(screen.getByRole('region', { name: 'Применение конфига' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Посмотреть диф' })).toBeInTheDocument();
  });

  it('отменяет правки: черновик снят, файл с устройства на месте', async () => {
    loadDocument();
    renderWithQuery(<ConfigApplyBar />);

    await userEvent.click(screen.getByRole('button', { name: 'Отменить правки' }));

    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(ConfigDocumentState.getState().applied).toBe(APPLIED);
  });

  it('отправляет в Apply текст черновика, а не разобранный конфиг', async () => {
    const sent: string[] = [];

    server.use(
      http.post(DAEMON_ENDPOINT.apply(), async ({ request }) => {
        sent.push(await request.text());

        return HttpResponse.json(TRANSACTION, { status: 202 });
      }),
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(TRANSACTION))
    );

    loadDocument();
    renderWithQuery(<ConfigApplyBar />);

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(sent).toEqual([DRAFT]);
    });
  });

  it('в окне подтверждения отсчитывает остаток и подтверждает по кнопке', async () => {
    const confirmed: string[] = [];

    server.use(
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(TRANSACTION)),
      http.post(DAEMON_ENDPOINT.applyConfirm(TRANSACTION.id), () => {
        confirmed.push(TRANSACTION.id);

        return HttpResponse.json({ ...TRANSACTION, phase: 'confirmed', window: 0 });
      })
    );

    serveStatus(TRANSACTION);
    loadDocument();
    renderWithQuery(<ConfigApplyBar />);

    const confirm = await screen.findByRole('button', { name: 'Связь есть, оставить' });

    expect(screen.getByText('60 с')).toBeInTheDocument();

    await userEvent.click(confirm);

    await waitFor(() => {
      expect(confirmed).toEqual([TRANSACTION.id]);
    });
  });

  it('пересинхронизирует остаток с ответом опроса, а не досчитывает старое значение', async () => {
    let transaction: typeof TRANSACTION = TRANSACTION;

    server.use(http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(transaction)));
    serveStatus(TRANSACTION);
    loadDocument();

    vi.useFakeTimers();
    renderWithQuery(<ConfigApplyBar />);

    // Окно подтверждения приходит отложенным рендером: `act` доводит его вместе
    // с эффектом отсчёта до DOM, пока фейковые часы стоят на месте.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceUntil(() => screen.queryByText('60 с') !== null);

    expect(screen.getByText('60 с')).toBeInTheDocument();

    // Локальный тик без нового значения от опроса: остаток считается от 60 сам.
    await advanceUntil(() => screen.queryByText('55 с') !== null);

    expect(screen.getByText('55 с')).toBeInTheDocument();

    transaction = { ...TRANSACTION, window: 20_000_000_000 };

    await advanceUntil(() => screen.queryByText('20 с') !== null);

    expect(screen.getByText('20 с')).toBeInTheDocument();
  });

  it('показывает вывод sing-box, когда бинарь отверг конфиг', async () => {
    server.use(
      http.post(DAEMON_ENDPOINT.apply(), () =>
        HttpResponse.json(
          {
            code: 'check_failed',
            message: 'sing-box отверг конфиг',
            details: { stdout: '', stderr: 'FATAL decode config: unknown field', exit_code: 1 },
          },
          { status: 422 }
        )
      )
    );

    loadDocument();
    renderWithQuery(<ConfigApplyBar />);

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(await screen.findByText('FATAL decode config: unknown field')).toBeInTheDocument();
    expect(screen.getByText(/Код выхода: 1/)).toBeInTheDocument();
    // Черновик остаётся: на нём пользователь чинит конфиг.
    expect(ConfigDocumentState.getState().draft).toBe(DRAFT);
  });

  it('сообщает, что секцию clash_api дописал демон', async () => {
    serveStatus({ ...TRANSACTION, clash_api_added: true });
    server.use(
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () =>
        HttpResponse.json({ ...TRANSACTION, clash_api_added: true })
      )
    );

    loadDocument();
    renderWithQuery(<ConfigApplyBar />);

    expect(await screen.findByText('metabox дописал в конфиг experimental.clash_api')).toBeInTheDocument();
    expect(screen.getByText(/служба перезапущена тем же циклом применения/)).toBeInTheDocument();
  });

  it('показывает автооткат и без черновика: откат версии своего черновика не заводит', async () => {
    const rolledBack = { ...TRANSACTION, phase: 'rolled_back', window: 0, reason: '' };

    serveStatus(rolledBack);
    server.use(
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(rolledBack)),
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(APPLIED))
    );

    loadDocument(false);
    renderWithQuery(<ConfigApplyBar />);

    expect(await screen.findByText('Подтверждения не было — предыдущий конфиг возвращён')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }));

    expect(screen.queryByText('Подтверждения не было — предыдущий конфиг возвращён')).not.toBeInTheDocument();
  });
});
