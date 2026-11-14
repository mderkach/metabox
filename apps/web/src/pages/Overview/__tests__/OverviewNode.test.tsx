import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { PROXY_ENDPOINT } from '@entities/Proxy';
import { CLASH_PROXIES_FIXTURE } from '@entities/Proxy/__tests__/Proxy.fixture';

import { OverviewNode } from '../ui/OverviewNode';

function OverviewNodeScreen() {
  return <OverviewNode onSelected={() => {}} />;
}

describe('overview node card', () => {
  // Saying that groups pick nodes by latency is false when the config has no groups at all.
  it('says the config has no groups when rules point straight at outbounds', async () => {
    const { direct, 'sub-eu/eu-reality': node } = CLASH_PROXIES_FIXTURE.proxies;

    server.use(
      http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: { direct, 'sub-eu/eu-reality': node } }))
    );

    renderWithRouter(OverviewNodeScreen);

    expect(await screen.findByText(/Групп в конфиге нет/)).toBeInTheDocument();
    expect(screen.queryByText(/Нет групп с ручным выбором/)).not.toBeInTheDocument();
  });

  it('points to the proxies screen when every group picks its node by latency', async () => {
    const { proxy, 'sub-eu/eu-reality': node } = CLASH_PROXIES_FIXTURE.proxies;

    server.use(
      http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: { proxy, 'sub-eu/eu-reality': node } }))
    );

    renderWithRouter(OverviewNodeScreen);

    expect(await screen.findByText(/Нет групп с ручным выбором/)).toBeInTheDocument();
  });
});
