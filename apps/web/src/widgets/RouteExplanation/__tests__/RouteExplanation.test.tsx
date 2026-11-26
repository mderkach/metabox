import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import {
  ROUTE_EXPLANATION_FIXTURE,
  ROUTE_FINAL_FIXTURE,
  ROUTE_UNKNOWN_FIXTURE,
  withAppliedRuleReference,
} from '@entities/Route/__tests__/Route.fixture';
import { createRouteExplanationHandler } from '@entities/Route/__tests__/Route.handlers';

import { RouteExplanation } from '../ui/RouteExplanation';
import { RouteExplanationSheet } from '../ui/RouteExplanationSheet';

const APPLIED_ETAG = '"verified"';
const CONFIRMED_EXPLANATION = withAppliedRuleReference(ROUTE_EXPLANATION_FIXTURE, 6, APPLIED_ETAG);

function serveExplanation(body: typeof ROUTE_EXPLANATION_FIXTURE) {
  server.use(createRouteExplanationHandler({ ...body, connection_id: 'c-1' }));
}

function serveConfig(text: string, etag = APPLIED_ETAG) {
  server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text, { headers: { ETag: etag } })));
}

function configWithRules(count: number, lastName?: string): string {
  const rules = Array.from({ length: count }, (_, index) => {
    const name = index === count - 1 && lastName !== undefined ? `// ${lastName}\n` : '';
    return name + JSON.stringify({ inbound: `in-${String(index)}`, outbound: 'direct' });
  });

  return `{"route":{"rules":[\n${rules.join(',\n')}\n]}}`;
}

describe('RouteExplanation', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(...createDeviceHandlers());
  });

  it('names the source by the device label, and leaves the address as a hint', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('с устройства Ноутбук')).toHaveAttribute('title', '192.168.1.60');
  });

  it('shows the matched rule name and its observed origin', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length, 'Applied rule name'));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    // Daemon indexes count from zero, rules on the screen are numbered from one.
    expect(await screen.findByText('Сработало правило 7')).toBeInTheDocument();
    expect(screen.getByText('Applied rule name')).toBeInTheDocument();
    expect(screen.getByText('Сет правил: google-ip')).toHaveAttribute('title', 'rule_set=google-ip');
    expect(screen.getAllByText('от ядра').length).toBeGreaterThan(0);
  });

  it('leads to the rule in the editor with its confirmed applied revision', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    const link = await screen.findByRole('link', { name: 'Открыть правило в редакторе' });

    const url = new URL(link.getAttribute('href') ?? '', document.baseURI);
    expect(url.pathname).toBe('/config');
    expect(url.searchParams.get('rule')).toBe('7');
    expect(url.searchParams.get('ruleEtag')).toBe(JSON.stringify(APPLIED_ETAG));
    // Variant classes pass through `cn`: otherwise the base `border-transparent`
    // survives next to the variant `border-border`, and the link is left without a border.
    expect(link).toHaveClass('border-border');
    expect(link).not.toHaveClass('border-transparent');
  });

  it('keeps the observed rule when the applied revision changed at the same list length', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length, 'Different rule name'), '"reordered"');

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('Позиция правила не подтверждена')).toBeInTheDocument();
    expect(screen.queryByText('Different rule name')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть правило в редакторе' })).not.toBeInTheDocument();
    // The node number of a foreign document is not shown at all: it would point to
    // a different rule.
    expect(screen.queryByText('Сработало правило 7')).not.toBeInTheDocument();
    // The rule sing-box reported stays visible by its conditions, with its origin.
    expect(screen.getByText('Сработавшее правило по данным ядра')).toBeInTheDocument();
    expect(screen.getByText('Сет правил: google-ip')).toBeInTheDocument();
    expect(screen.queryByText('Правило не определено')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть конфигурацию' })).toHaveAttribute('href', '/config');
    // Rule positions above are not those of the file either.
    expect(
      within(screen.getByRole('list', { name: 'Правила выше сработавшего' })).queryByText('1')
    ).not.toBeInTheDocument();
  });

  it('keeps the observed rule without a position when the daemon sends no proof', async () => {
    serveExplanation({
      ...ROUTE_EXPLANATION_FIXTURE,
      match: { ...ROUTE_EXPLANATION_FIXTURE.match, index: undefined },
    });
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length, 'Unverified rule name'));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source=''
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('Сработавшее правило по данным ядра')).toBeInTheDocument();
    expect(screen.getByText('Сет правил: google-ip')).toBeInTheDocument();
    expect(screen.getByTitle('route(alt-fallback)')).toBeInTheDocument();
    expect(screen.queryByText('Unverified rule name')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть правило в редакторе' })).not.toBeInTheDocument();
  });

  it('opens the config without a position when the draft differs from the applied file', async () => {
    const applied = configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length, 'Applied rule name');
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(applied);
    ConfigDocumentState.getState().load(applied, APPLIED_ETAG);
    ConfigDocumentState.getState().replace(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length, 'Draft rule name'));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source=''
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('Applied rule name')).toBeInTheDocument();
    expect(screen.queryByText('Draft rule name')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть конфигурацию' })).toHaveAttribute('href', '/config');
    expect(screen.queryByRole('link', { name: 'Открыть правило в редакторе' })).not.toBeInTheDocument();
  });

  it('shows the default outbound as an observation, not as unknown', async () => {
    serveExplanation(ROUTE_FINAL_FIXTURE);
    serveConfig(configWithRules(ROUTE_FINAL_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('Ни одно правило не совпало')).toBeInTheDocument();
    expect(screen.queryByText('неизвестно')).not.toBeInTheDocument();
  });

  it('shows an unknown rule as a reason, not as a guess', async () => {
    serveExplanation(ROUTE_UNKNOWN_FIXTURE);
    serveConfig(configWithRules(0));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('Правило не определено')).toBeInTheDocument();
    // The reason is the panel translation by the daemon code, not its string: it is in its language.
    expect(screen.getByText('в списке правил работающего ядра нет правила для этого соединения')).toBeInTheDocument();
    expect(screen.queryByText(ROUTE_UNKNOWN_FIXTURE.match.reason ?? '')).not.toBeInTheDocument();
    expect(screen.getByText('неизвестно')).toBeInTheDocument();
  });

  it('shows the chain in human reading order', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    const chain = await screen.findByRole('list', { name: 'Цепочка прокси' });

    expect(chain).toHaveTextContent('alt-fallbackhk-01');
  });

  it('is named after the connection it describes', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(
      await screen.findByRole('complementary', { name: 'Маршрут соединения video.example:443' })
    ).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithRouter(() => (
      <RouteExplanation
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={onClose}
      />
    ));

    await screen.findByRole('complementary');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RouteExplanationSheet', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    serveExplanation(CONFIRMED_EXPLANATION);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));
    server.use(...createDeviceHandlers());
  });

  it('is open while a connection is selected, and is named after it', async () => {
    renderWithRouter(() => (
      <RouteExplanationSheet
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    const sheet = await screen.findByRole('dialog', { name: 'Маршрут соединения video.example:443' });

    expect(await within(sheet).findByText('Сработало правило 7')).toBeInTheDocument();
  });

  it('is closed without a selected connection', () => {
    renderWithRouter(() => (
      <RouteExplanationSheet editorTo='/config' connectionId={null} host='' source='' onClose={vi.fn<() => void>()} />
    ));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and with the close button', async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithRouter(() => (
      <RouteExplanationSheet
        editorTo='/config'
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={onClose}
      />
    ));

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Закрыть объяснение' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
