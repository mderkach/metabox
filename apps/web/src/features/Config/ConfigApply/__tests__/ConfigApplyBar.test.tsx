import { finishApplyBarTransition } from '@test/applyBar';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { ConfigApplyBar } from '../ui/ConfigApplyBar';

const APPLIED = '{\n  "log": { "level": "info" }\n}';
const APPLIED_ETAG = `"${'e'.repeat(64)}"`;
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
/** Taken before timers are faked: mock responses and React deferred render run outside the fake clock. */
const waitReal = globalThis.setTimeout;

/** Moves the fake clock in steps, giving the real one a tick between them. */
async function advanceUntil(happened: () => boolean): Promise<void> {
  for (let waited = 0; waited < POLL_LIMIT && !happened(); waited += POLL_STEP) {
    await vi.advanceTimersByTimeAsync(POLL_STEP);
    await new Promise<void>((resolve) => {
      waitReal(resolve, REAL_YIELD);
    });
  }
}

function loadDocument(draft = true) {
  ConfigDocumentState.getState().load(APPLIED, APPLIED_ETAG);

  if (draft) ConfigDocumentState.getState().replace(DRAFT);
}

/** Apply goes through the summary: the bar button opens it, the dialog button sends. */
async function applyFromSummary() {
  await userEvent.click(screen.getByRole('button', { name: 'Применить' }));
  const summary = await screen.findByRole('dialog', { name: 'Что уйдёт на устройство' });

  await userEvent.click(within(summary).getByRole('button', { name: 'Применить' }));
}

describe('ConfigApplyBar', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    serveStatus();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays silent while there are no edits and no apply is running', () => {
    loadDocument(false);
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(screen.queryByRole('region', { name: 'Применение конфига' })).not.toBeInTheDocument();
  });

  it('reports the space it covers while visible or sliding away, and zero after it leaves', () => {
    const barHeight = 64;
    const onSpaceChange = vi.fn<(space: number) => void>();

    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(barHeight);
    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={onSpaceChange} />);

    expect(onSpaceChange).toHaveBeenLastCalledWith(barHeight);

    act(() => {
      ConfigDocumentState.getState().discard();
    });

    expect(onSpaceChange).toHaveBeenLastCalledWith(barHeight);

    finishApplyBarTransition();

    expect(onSpaceChange).toHaveBeenLastCalledWith(0);
  });

  it('on a draft applies through the summary of changes', async () => {
    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(screen.getByRole('region', { name: 'Применение конфига' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    const summary = await screen.findByRole('dialog', { name: 'Что уйдёт на устройство' });

    expect(within(summary).getByRole('button', { name: 'Применить' })).toBeEnabled();
    expect(within(summary).getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
  });

  it('does not apply a draft whose text does not parse and names the line to fix', async () => {
    ConfigDocumentState.getState().load(APPLIED, APPLIED_ETAG);
    ConfigDocumentState.getState().replace('{\n  "log": {\n}');
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(await screen.findByText(/ошибка в строке \d+/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(
      within(await screen.findByRole('dialog', { name: 'Что уйдёт на устройство' })).getByRole('button', {
        name: 'Применить',
      })
    ).toBeDisabled();
  });

  it('does not apply while metabox does not answer and says so', async () => {
    server.use(http.get(DAEMON_ENDPOINT.status(), () => new HttpResponse(null, { status: 502 })));
    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(await screen.findByText('metabox не отвечает — применить сейчас нельзя.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(
      within(await screen.findByRole('dialog', { name: 'Что уйдёт на устройство' })).getByRole('button', {
        name: 'Применить',
      })
    ).toBeDisabled();
  });

  it('keeps the draft reset at the edge, apart from "Apply"', () => {
    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    const bar = screen.getByRole('region', { name: 'Применение конфига' });
    const names = within(bar)
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(names).toEqual(['Отменить правки', 'Применить']);
  });

  it('cancels edits only after confirmation: the draft is cleared, the file from the device is in place', async () => {
    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Отменить правки' }));
    expect(ConfigDocumentState.getState().draft).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить черновик' }));

    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(ConfigDocumentState.getState().applied).toBe(APPLIED);
  });

  it('warns that the config on the device changed since the draft, and lets it be discarded', async () => {
    loadDocument();
    ConfigDocumentState.getState().load(APPLIED.replace('info', 'warn'), APPLIED_ETAG);
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(screen.getByText('Конфиг на роутере изменился после начала правок')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Отбросить черновик' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сбросить черновик' }));

    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(screen.queryByRole('region', { name: 'Применение конфига' })).not.toBeInTheDocument();
  });

  it('sends the draft text and the base fingerprint to Apply, not the parsed config', async () => {
    const sent: { text: string; base: string | null }[] = [];

    server.use(
      http.post(DAEMON_ENDPOINT.apply(), async ({ request }) => {
        sent.push({ text: await request.text(), base: request.headers.get('If-Match') });

        return HttpResponse.json(TRANSACTION, { status: 202 });
      }),
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(TRANSACTION))
    );

    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    await applyFromSummary();

    await waitFor(() => {
      expect(sent).toEqual([{ text: DRAFT, base: APPLIED_ETAG }]);
    });
  });

  it('in the confirmation window counts down the remainder and confirms by the button', async () => {
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
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    const confirm = await screen.findByRole('button', { name: 'Связь есть, оставить' });

    expect(screen.getByText('60 с')).toBeInTheDocument();

    await userEvent.click(confirm);

    await waitFor(() => {
      expect(confirmed).toEqual([TRANSACTION.id]);
    });
  });

  it('resynchronizes the remainder with the poll response instead of counting down the old value', async () => {
    let transaction: typeof TRANSACTION = TRANSACTION;

    server.use(http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(transaction)));
    serveStatus(TRANSACTION);
    loadDocument();

    vi.useFakeTimers();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    // The confirmation window arrives with a deferred render: `act` brings it along with
    // the countdown effect to the DOM while the fake clock stands still.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await advanceUntil(() => screen.queryByText('60 с') !== null);

    expect(screen.getByText('60 с')).toBeInTheDocument();

    // A local tick without a new value from the poll: the remainder counts down from 60 on its own.
    await advanceUntil(() => screen.queryByText('55 с') !== null);

    expect(screen.getByText('55 с')).toBeInTheDocument();

    transaction = { ...TRANSACTION, window: 20_000_000_000 };

    await advanceUntil(() => screen.queryByText('20 с') !== null);

    expect(screen.getByText('20 с')).toBeInTheDocument();
  });

  it('shows the sing-box output when the binary rejected the config', async () => {
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
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    await applyFromSummary();

    expect(await screen.findByText('FATAL decode config: unknown field')).toBeInTheDocument();
    expect(screen.getByText(/Код выхода: 1/)).toBeInTheDocument();
    // The draft stays: the user fixes the config on it.
    expect(ConfigDocumentState.getState().draft).toBe(DRAFT);
  });

  it('suggests a command when the service working directory did not match the config directory', async () => {
    server.use(
      http.post(DAEMON_ENDPOINT.apply(), () =>
        HttpResponse.json(
          {
            code: 'workdir_mismatch',
            message: 'рабочий каталог службы sing-box не совпадает с каталогом конфига',
            details: { workdir: '/usr/share/sing-box', config_dir: '/etc/sing-box' },
          },
          { status: 409 }
        )
      )
    );

    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    await applyFromSummary();

    expect(
      await screen.findByText('Служба sing-box запущена из другого каталога — применение остановлено')
    ).toBeInTheDocument();
    expect(screen.getByText(/служба ищет их в \/usr\/share\/sing-box/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "uci set sing-box.main.workdir='/etc/sing-box' && uci commit sing-box && /etc/init.d/sing-box restart"
      )
    ).toBeInTheDocument();
    // The draft stays: after the service is set up, it is applied again.
    expect(ConfigDocumentState.getState().draft).toBe(DRAFT);
  });

  it('reports that the daemon appended the clash_api section', async () => {
    serveStatus({ ...TRANSACTION, clash_api_added: true });
    server.use(
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () =>
        HttpResponse.json({ ...TRANSACTION, clash_api_added: true })
      )
    );

    loadDocument();
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(await screen.findByText('metabox добавил в конфиг experimental.clash_api')).toBeInTheDocument();
    expect(screen.getByText(/Служба перезапущена тем же применением/)).toBeInTheDocument();
  });

  it('shows the automatic rollback even without a draft: a version rollback does not create its own draft', async () => {
    const rolledBack = { ...TRANSACTION, phase: 'rolled_back', window: 0, reason: '' };

    serveStatus(rolledBack);
    server.use(
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(rolledBack)),
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(APPLIED))
    );

    loadDocument(false);
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(await screen.findByText('Подтверждения не было — предыдущий конфиг возвращён')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть' }));

    // The bar collapses with the same text, but leaves the accessibility tree at once.
    expect(screen.queryByRole('region', { name: 'Применение конфига' })).not.toBeInTheDocument();
  });

  it('does not pass the first apply without a backup off as a rollback', async () => {
    const noBackup = {
      ...TRANSACTION,
      phase: 'failed',
      window: 0,
      reason_code: 'no_backup',
      reason: 'бэкапа нет',
    };

    serveStatus(noBackup);
    server.use(
      http.get(DAEMON_ENDPOINT.applyState(TRANSACTION.id), () => HttpResponse.json(noBackup)),
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(APPLIED))
    );

    loadDocument(false);
    renderWithQuery(<ConfigApplyBar onSpaceChange={vi.fn<(space: number) => void>()} />);

    expect(await screen.findByText('Применение не прошло')).toBeInTheDocument();
    expect(screen.getByText(/откатывать было не на что/)).toBeInTheDocument();
    expect(screen.queryByText('Подтверждения не было — предыдущий конфиг возвращён')).not.toBeInTheDocument();
  });
});
