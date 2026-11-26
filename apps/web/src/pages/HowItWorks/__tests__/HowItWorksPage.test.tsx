import { linkOptions } from '@tanstack/react-router';
import { defaultParseSearch } from '@tanstack/react-router';
import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState } from '@entities/Config';
import { configHandlers } from '@entities/Config/__tests__/Config.handlers';
import { ConnectionStore } from '@entities/Connection';
import { CONNECTIONS_FIXTURE } from '@entities/Connection/__tests__/Connection.fixture';
import { DAEMON_ENDPOINT, DAEMON_QUERY } from '@entities/Daemon';
import { SERVICE_RUNNING_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { createStatefulProxyHandlers } from '@entities/Proxy/__tests__/Proxy.handlers';
import { ROUTE_ENDPOINT } from '@entities/Route';
import { withAppliedRuleReference } from '@entities/Route/__tests__/Route.fixture';
import { createRouteExplanationHandler, createRouteHandlers } from '@entities/Route/__tests__/Route.handlers';
import { NARROW_SCREEN } from '@shared/lib/media';

import type { HowItWorksLinks } from '../model/HowItWorks.links';
import { HowItWorksPage } from '../ui/HowItWorksPage';

const LINKS: HowItWorksLinks = {
  overview: '/overview',
  devices: '/devices',
  proxies: '/proxies',
  settings: '/settings',
  ruleSet: (set) => linkOptions({ to: '/config/rule-set', search: { set } }),
  rule: (search) => linkOptions({ to: '/config', search }),
  section: (section) => linkOptions({ to: '/config/$section', params: { section } }),
};

function HowItWorksScreen() {
  return <HowItWorksPage links={LINKS} />;
}

const LIVE_TITLE = 'Открытые соединения';
const APPLIED_ETAG = `"${'a'.repeat(64)}"`;
const NAMED_RULE = `{
  "type": "logical", "mode": "or", "outbound": "us-fallback", "rules": [
    { "rule_set": ["media-sites"] },
    { "type": "logical", "mode": "and", "rules": [ { "rule_set": ["second-set", "media-sites"] } ] }
  ]
}`;
const UNNAMED_RULE = '{ "rule_set": ["geosite-ru"], "outbound": "direct" }';
const APPLIED_RULES = `{
  "route": { "rules": [
    // Media routing
    ${NAMED_RULE},
    ${UNNAMED_RULE}
  ] }
}`;
const REORDERED_RULES = `{
  "route": { "rules": [
    ${UNNAMED_RULE},
    // Media routing
    ${NAMED_RULE}
  ] }
}`;

function showLiveRule(index: number, explainedEtag = APPLIED_ETAG) {
  const sample = CONNECTIONS_FIXTURE.connections.at(0);
  if (sample === undefined) throw new Error('No initial connection in fixture');
  const conditions = index === 0 ? 'rule_set=media-sites' : 'rule_set=geosite-ru';
  const action = index === 0 ? 'route(us-fallback)' : 'route(direct)';
  const nodes = index === 0 ? sample.chain : ['direct'];
  const row = { ...sample, rule: conditions, action, chain: nodes };

  server.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(APPLIED_RULES, { headers: { ETag: APPLIED_ETAG } })),
    createRouteExplanationHandler(
      withAppliedRuleReference(
        {
          connection_id: row.id,
          match: { origin: 'observed', kind: 'rule', index, conditions, action },
          chain: { origin: 'observed', nodes },
          rules: [
            {
              origin: 'observed',
              index: 0,
              type: 'logical',
              conditions: 'rule_set=media-sites',
              action: 'route(us-fallback)',
            },
            {
              origin: 'observed',
              index: 1,
              type: 'default',
              conditions: 'rule_set=geosite-ru',
              action: 'route(direct)',
            },
          ],
        },
        index,
        explainedEtag
      )
    )
  );
  ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [row] });
}

class SilentEventSource {
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

describe('How metabox works', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', SilentEventSource);
    ConnectionStore.getState().reset();
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
      ...configHandlers,
      ...createDeviceHandlers(),
      ...createStatefulProxyHandlers(),
      ...createRouteHandlers(CONNECTIONS_FIXTURE.connections)
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    ConfigDocumentState.getState().reset();
    await i18next.changeLanguage('ru');
  });

  it('keeps the terms but shows no invented connection', async () => {
    ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [] });
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText('Сейчас нет соединений.')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: LIVE_TITLE })).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Термины' })).toBeInTheDocument();
  });

  it('points to Overview when the core is stopped', async () => {
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json({ ...SERVICE_RUNNING_FIXTURE, status: 'stopped' }))
    );
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByRole('link', { name: 'Открыть Обзор' })).toHaveAttribute('href', '/overview');
    expect(screen.queryByRole('group', { name: LIVE_TITLE })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Термины' })).toBeInTheDocument();
  });

  it('follows a live group then a direct connection without reshuffling on new frames', async () => {
    const user = userEvent.setup();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksScreen);

    const choices = await screen.findByRole('group', { name: LIVE_TITLE });
    const first = await within(choices).findByRole('button', { pressed: true });
    expect(first).toHaveAccessibleName(/Через группу/);
    expect(await screen.findByText(/Выбран us/)).toBeInTheDocument();

    await user.click(within(choices).getByRole('button', { name: /Напрямую/ }));
    expect(await screen.findByText('Без прокси-сервера')).toBeInTheDocument();
    const direct = within(choices).getByRole('button', { pressed: true });

    act(() => {
      ConnectionStore.getState().apply({
        ...CONNECTIONS_FIXTURE,
        connections: CONNECTIONS_FIXTURE.connections.toReversed(),
      });
    });

    expect(direct).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the origin on each step taken from the route explanation', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksScreen);

    const walk = await screen.findByRole('list', { name: 'Путь соединения' });
    expect(await within(walk).findAllByText('от ядра')).toHaveLength(3);
    const steps = within(walk).getAllByRole('listitem');
    expect(steps.map((step) => within(step).queryByText('от ядра') !== null)).toEqual([false, false, true, true, true]);
  });

  it('keeps the last explanation after the connection closes', async () => {
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksScreen);
    expect(await screen.findByText(/Выбран us/)).toBeInTheDocument();

    act(() => {
      ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [] });
    });

    expect(await screen.findByText('Это соединение закрыто.')).toBeInTheDocument();
    expect(screen.getByText(/Выбран us/)).toBeInTheDocument();
  });

  it('replaces a connection that closes before the explanation arrives', async () => {
    const first = CONNECTIONS_FIXTURE.connections.at(0);
    if (first === undefined) throw new Error('No initial connection in fixture');
    server.use(
      http.get(ROUTE_ENDPOINT.explanation(first.id), () =>
        HttpResponse.json({ code: 'connection_missing', message: 'no connection with this ID' }, { status: 404 })
      )
    );
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksScreen);

    const choices = await screen.findByRole('group', { name: LIVE_TITLE });
    expect(await within(choices).findByRole('button', { pressed: true, name: /api.git.example/ })).toBeInTheDocument();
    expect(within(choices).queryByText(/video.example/)).not.toBeInTheDocument();
  });

  it('keeps rule and service links at their lists when the rule is unverified', async () => {
    const user = userEvent.setup();
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksScreen);

    await screen.findByText(/Не удалось сопоставить правило/);
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    await user.click(within(walk).getByRole('button', { name: /^Правило/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config');

    await user.click(within(walk).getByRole('button', { name: /^Куда соединение/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config/rule-set');
  });

  it.each([
    { index: 0, label: 'Media routing', tag: 'media-sites' },
    { index: 1, label: 'geosite-ru → direct', tag: 'geosite-ru' },
  ])('shows the confirmed applied rule $label and links its first service', async ({ index, label, tag }) => {
    const user = userEvent.setup();
    showLiveRule(index);
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText(label)).toBeInTheDocument();
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    const rule = within(walk).getByRole('button', { name: /^Правило/ });
    expect(rule).toHaveTextContent(`Правило ${index + 1}`);

    await user.click(rule);
    const target = screen.getByRole('link', { name: 'Где настроить' });
    const { search } = new URL(target.getAttribute('href') ?? '', 'https://example.test');
    expect(defaultParseSearch(search)).toEqual({ rule: index + 1, ruleEtag: APPLIED_ETAG });

    await user.click(within(walk).getByRole('button', { name: /^Куда соединение/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', `/config/rule-set?set=${tag}`);
  });

  it('retains the applied label and opens the rule list after the draft reorders rules', async () => {
    const user = userEvent.setup();
    showLiveRule(0);
    ConfigDocumentState.getState().load(APPLIED_RULES, APPLIED_ETAG);
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText('Media routing')).toBeInTheDocument();
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    await user.click(within(walk).getByRole('button', { name: /^Правило/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute(
      'href',
      expect.stringContaining('rule=1')
    );

    act(() => {
      ConfigDocumentState.getState().replace(REORDERED_RULES);
    });

    expect(screen.getByText('Media routing')).toBeInTheDocument();
    expect(within(walk).getByText('Правило 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config');
  });

  it('shows the nested services of a logical rule in document order', async () => {
    showLiveRule(0);
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText('media-sites, second-set')).toBeInTheDocument();
  });

  it('clears a verified service link when the core stops', async () => {
    const user = userEvent.setup();
    showLiveRule(0);
    const { queryClient } = renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText('Media routing')).toBeInTheDocument();
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    await user.click(within(walk).getByRole('button', { name: /^Куда соединение/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute(
      'href',
      '/config/rule-set?set=media-sites'
    );

    act(() => {
      queryClient.setQueryData(DAEMON_QUERY.service(), { ...SERVICE_RUNNING_FIXTURE, status: 'stopped' });
    });

    expect(await screen.findByRole('link', { name: 'Открыть Обзор' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Путь соединения' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config/rule-set');
  });

  it('keeps only the observed condition when the confirmed reference names another revision', async () => {
    const user = userEvent.setup();
    showLiveRule(0, `"${'b'.repeat(64)}"`);
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText('rule_set=media-sites')).toBeInTheDocument();
    expect(screen.queryByText('Media routing')).not.toBeInTheDocument();
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    await user.click(within(walk).getByRole('button', { name: /^Правило/ }));
    expect(screen.getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config');
  });

  it('shows the request failure with a retry and keeps the glossary available', async () => {
    const user = userEvent.setup();
    const first = CONNECTIONS_FIXTURE.connections.at(0);
    if (first === undefined) throw new Error('No initial connection in fixture');
    server.use(
      http.get(ROUTE_ENDPOINT.explanation(first.id), () =>
        HttpResponse.json({ message: 'mock failure' }, { status: 503 })
      )
    );
    ConnectionStore.getState().apply(CONNECTIONS_FIXTURE);
    renderWithRouter(HowItWorksScreen);

    expect(await screen.findByText('mock failure')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Термины' })).toBeInTheDocument();
    server.use(...createRouteHandlers(CONNECTIONS_FIXTURE.connections));
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText(/Выбран us/)).toBeInTheDocument();
  });

  it.each([
    [
      'en',
      'Open Overview',
      'Where it is configured',
      ['Device', 'Service', 'Rule', 'Outbound', 'Group', 'Server', 'Subscription', 'Core'],
    ],
    [
      'ru',
      'Открыть Обзор',
      'Где настроить',
      ['Устройство', 'Сервис', 'Правило', 'Выход', 'Группа', 'Сервер', 'Подписка', 'Ядро'],
    ],
  ] as const)('defines and links all eight terms in %s', async (language, overview, configure, names) => {
    await i18next.changeLanguage(language);
    const user = userEvent.setup();
    server.use(
      http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json({ ...SERVICE_RUNNING_FIXTURE, status: 'stopped' }))
    );
    renderWithRouter(HowItWorksScreen);
    await screen.findByRole('link', { name: overview });

    const destinations = [
      '/devices',
      '/config/rule-set',
      '/config',
      '/config/outbounds',
      '/proxies',
      '/config/outbounds',
      '/config/providers',
      '/settings',
    ];
    for (const [index, name] of names.entries()) {
      const card = screen.getByRole('button', { name });
      await user.click(card);
      expect(card).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('link', { name: configure })).toHaveAttribute('href', destinations[index]);
    }
  });

  it('opens a term directly below the selected step on a phone', async () => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: media === NARROW_SCREEN,
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    }));
    const user = userEvent.setup();
    ConnectionStore.getState().apply({ ...CONNECTIONS_FIXTURE, connections: [] });
    renderWithRouter(HowItWorksScreen);

    const north = await screen.findByRole('button', { name: /^Куда соединение/ });
    await user.click(north);
    const walk = screen.getByRole('list', { name: 'Путь соединения' });
    expect(within(walk).getByRole('heading', { name: 'Сервис' })).toBeInTheDocument();
    expect(within(walk).getByRole('link', { name: 'Где настроить' })).toHaveAttribute('href', '/config/rule-set');
    const announcement = screen.getAllByRole('status').find((status) => status.getAttribute('aria-live') === 'polite');
    expect(announcement).toHaveTextContent(/^Сервис\. Готовый список/);
    expect(north).toHaveFocus();
  });
});
