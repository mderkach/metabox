import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';

import { ConfigApplyHistory } from '../ui/ConfigApplyHistory';

const VERSIONS = [
  { id: 1, size: 4096, sum: 'a'.repeat(64), saved_at: 1_757_500_000 },
  { id: 2, size: 8192, sum: 'b'.repeat(64), saved_at: 0 },
];

function serveVersions(versions: unknown[] = VERSIONS) {
  server.use(http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions })));
}

describe('ConfigApplyHistory', () => {
  it('показывает версии от свежей к старой', async () => {
    serveVersions();
    renderWithQuery(<ConfigApplyHistory />);

    await userEvent.click(screen.getByRole('button', { name: /История версий/ }));

    const rows = await screen.findAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('№ 2'),
      expect.stringContaining('№ 1'),
    ]);
  });

  it('часы устройства без синхронизации не показывает датой', async () => {
    serveVersions();
    renderWithQuery(<ConfigApplyHistory />);

    await userEvent.click(screen.getByRole('button', { name: /История версий/ }));

    expect(await screen.findByText('время сохранения неизвестно')).toBeInTheDocument();
  });

  it('пустую историю объясняет словами, а не пустым списком', async () => {
    serveVersions([]);
    renderWithQuery(<ConfigApplyHistory />);

    await userEvent.click(screen.getByRole('button', { name: /История версий/ }));

    expect(await screen.findByText(/История пуста/)).toBeInTheDocument();
  });

  it('откат уходит на ручку восстановления версии', async () => {
    const restored: string[] = [];

    serveVersions();
    server.use(
      http.post(CONFIG_ENDPOINT.versionRestore(2), () => {
        restored.push('2');

        return HttpResponse.json({ id: 'tx-1', phase: 'awaiting_confirm', window: 60_000_000_000 }, { status: 202 });
      }),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json({ version: 'dev' }))
    );

    renderWithQuery(<ConfigApplyHistory />);

    await userEvent.click(screen.getByRole('button', { name: /История версий/ }));

    const [newest] = await screen.findAllByRole('button', { name: 'Вернуть' });

    await userEvent.click(newest);

    await waitFor(() => {
      expect(restored).toEqual(['2']);
    });
  });

  it('отказ бинаря показывает в диалоге и оставляет его открытым', async () => {
    serveVersions();
    server.use(
      http.post(CONFIG_ENDPOINT.versionRestore(2), () =>
        HttpResponse.json(
          {
            code: 'check_failed',
            message: 'sing-box отверг конфиг',
            details: { stdout: '', stderr: 'FATAL старая версия не принимается', exit_code: 1 },
          },
          { status: 422 }
        )
      )
    );

    renderWithQuery(<ConfigApplyHistory />);

    await userEvent.click(screen.getByRole('button', { name: /История версий/ }));

    const [newest] = await screen.findAllByRole('button', { name: 'Вернуть' });

    await userEvent.click(newest);

    expect(await screen.findByText('FATAL старая версия не принимается')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).not.toHaveLength(0);
  });
});
