import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConnectionStore } from '@entities/Connection';
import { makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';
import { RuntimeStore, SCHEMA_VERSION } from '@entities/Daemon';
import { CLASH_CONFIGS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { API_ENDPOINT } from '@shared/api';

import { OverviewPage } from '../ui/OverviewPage';

function serveStatus(configPath?: string, singboxVersion = SCHEMA_VERSION) {
  server.use(
    http.get(API_ENDPOINT.status(), () =>
      HttpResponse.json({ version: 'dev', singbox_version: singboxVersion, config_path: configPath })
    ),
    http.get(API_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE))
  );
}

describe('экран обзора', () => {
  beforeEach(() => {
    ConnectionStore.getState().reset();
    RuntimeStore.getState().reset();
    serveStatus();
  });

  it('показывает скорость из потока, а не накопительный счётчик', () => {
    RuntimeStore.getState().pushTraffic({ up: 8500, down: 43_400 });

    renderWithQuery(<OverviewPage />);

    const tiles = within(screen.getByRole('list', { name: 'Показатели рантайма' }));

    expect(tiles.getByText('42.4 кБ/с')).toBeInTheDocument();
    expect(tiles.getByText('8.3 кБ/с')).toBeInTheDocument();
  });

  it('вместо нулевой памяти первого сэмпла показывает прочерк', () => {
    RuntimeStore.getState().pushMemory({ inuse: 0, oslimit: 0 });

    renderWithQuery(<OverviewPage />);

    const tiles = within(screen.getByRole('list', { name: 'Показатели рантайма' }));

    expect(tiles.getByText('—')).toBeInTheDocument();
  });

  it('показывает память, когда пришёл непустой сэмпл', () => {
    RuntimeStore.getState().pushMemory({ inuse: 51_380_224, oslimit: 0 });

    renderWithQuery(<OverviewPage />);

    const tiles = within(screen.getByRole('list', { name: 'Показатели рантайма' }));

    expect(tiles.getByText('49.0 МБ')).toBeInTheDocument();
  });

  it('считает соединения по снапшоту потока', () => {
    ConnectionStore.getState().apply(makeConnectionsSnapshot(7));

    renderWithQuery(<OverviewPage />);

    const tiles = within(screen.getByRole('list', { name: 'Показатели рантайма' }));

    expect(tiles.getByText('7')).toBeInTheDocument();
  });

  it('подписывает ось графика значением, которого он достигает', () => {
    RuntimeStore.getState().pushTraffic({ up: 1000, down: 100_000 });

    renderWithQuery(<OverviewPage />);

    expect(screen.getByRole('img', { name: 'Трафик за минуту, пик 97.7 кБ/с' })).toBeInTheDocument();
  });

  it('различает «демон отвечает» и «не отвечает»', async () => {
    renderWithQuery(<OverviewPage />);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
  });

  it('показывает режим Clash API: с ним сверяется правило clash_mode в конфиге', async () => {
    renderWithQuery(<OverviewPage />);

    expect(await screen.findByText('Rule')).toBeInTheDocument();
  });
  it('путь конфига берётся у демона: он задаётся флагами запуска, а не панелью', async () => {
    serveStatus('/srv/sing-box/router.json');

    renderWithQuery(<OverviewPage />);

    expect(await screen.findByText('/srv/sing-box/router.json')).toBeInTheDocument();
  });

  it('демон без этого поля не оставляет экран без пути', async () => {
    renderWithQuery(<OverviewPage />);

    expect(await screen.findByText('/etc/sing-box/config.json')).toBeInTheDocument();
  });

  // AC-28.
  it('предупреждает, когда версия бинаря разошлась со схемой форм', async () => {
    serveStatus(undefined, '1.13.18-extended-2.6.5');

    renderWithQuery(<OverviewPage />);

    const alert = await screen.findByRole('alert');

    expect(within(alert).getByText('Версия sing-box разошлась со схемой форм')).toBeInTheDocument();
    expect(alert).toHaveTextContent(SCHEMA_VERSION);
    expect(alert).toHaveTextContent('1.13.18-extended-2.6.5');
  });

  it('на совпадающей версии предупреждения нет', async () => {
    renderWithQuery(<OverviewPage />);

    expect(await screen.findByText('демон отвечает')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
