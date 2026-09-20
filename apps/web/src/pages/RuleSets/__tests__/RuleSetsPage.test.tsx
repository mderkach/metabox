import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { RuleSetsPage } from '../ui/RuleSetsPage';

const CONFIG = JSON.stringify(
  {
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'selector', tag: 'proxy', outbounds: ['direct'] },
    ],
    route: {
      rules: [{ rule_set: ['geosite-google'], outbound: 'proxy' }],
      rule_set: [
        {
          type: 'remote',
          tag: 'geosite-google',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-google.srs',
          update_interval: '24h',
        },
        {
          type: 'remote',
          tag: 'geoip-ru',
          url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ru.srs',
          update_interval: '12h',
        },
      ],
    },
    experimental: { cache_file: { enabled: true } },
  },
  null,
  2
);

/** Шапка тоже строка таблицы, поэтому строк на единицу больше, чем наборов. */
const HEADER_ROWS = 1;

describe('экран сетов', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG)),
      // Шапка экрана открывает историю версий, а бар применения опрашивает демона.
      http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] })),
      http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
    );
  });

  it('шапка называет колонки списка', async () => {
    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual(['Сет', 'Источник', 'Использование', 'Действия над строкой']);
  });

  // Сырое `24h` из конфига владелец роутера читать не обязан.
  it('интервал обновления печатает словами', async () => {
    renderWithRouter(RuleSetsPage);

    expect(await screen.findByText('обновляется раз в сутки')).toBeInTheDocument();
    expect(screen.getByText('обновляется каждые 12 ч')).toBeInTheDocument();
  });

  it('поиск отбирает строки и сбрасывается кнопкой пустого экрана', async () => {
    const user = userEvent.setup();

    renderWithRouter(RuleSetsPage);

    const table = await screen.findByRole('table', { name: 'Подключённые сеты' });

    expect(within(table).getAllByRole('row')).toHaveLength(2 + HEADER_ROWS);

    const search = screen.getByRole('textbox', { name: 'Поиск по сетам' });

    await user.type(search, 'geoip');

    expect(within(table).getAllByRole('row')).toHaveLength(1 + HEADER_ROWS);
    expect(within(table).getByText('geoip-ru')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'нетакого');

    expect(screen.queryByRole('table', { name: 'Подключённые сеты' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить отбор' }));

    expect(await screen.findByRole('table', { name: 'Подключённые сеты' })).toBeInTheDocument();
  });
});
