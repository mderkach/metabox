import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { CONFIG_ENDPOINT } from '@entities/Config';
import { CONFIG_FIXTURE } from '@entities/Config/__tests__/Config.fixture';
import { createDeviceHandlers } from '@entities/Device/__tests__/Device.handlers';
import { ROUTE_ENDPOINT } from '@entities/Route';
import {
  ROUTE_EXPLANATION_FIXTURE,
  ROUTE_FINAL_FIXTURE,
  ROUTE_UNKNOWN_FIXTURE,
} from '@entities/Route/__tests__/Route.fixture';

import { RouteExplanation } from '../ui/RouteExplanation';
import { RouteExplanationSheet } from '../ui/RouteExplanationSheet';

const JSON_INDENT = 2;

/** The fixture config has 32 rules, and the explanation comes for 7: the lengths differ. */
const CONFIG_TEXT = JSON.stringify(CONFIG_FIXTURE, null, JSON_INDENT);

function serveExplanation(body: typeof ROUTE_EXPLANATION_FIXTURE) {
  server.use(http.get(ROUTE_ENDPOINT.explanation('c-1'), () => HttpResponse.json(body)));
}

function serveConfig(text: string) {
  server.use(http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)));
}

/** A config with exactly the number of rules the daemon returned: the link to the node is alive. */
function configWithRules(count: number): string {
  const rules = Array.from({ length: count }, (_, index) => ({ inbound: `in-${String(index)}`, outbound: 'direct' }));

  return JSON.stringify({ route: { rules } }, null, JSON_INDENT);
}

describe('RouteExplanation', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    server.use(...createDeviceHandlers());
  });

  it('names the source by the device label, and leaves the address as a hint', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('с устройства Ноутбук')).toHaveAttribute('title', '192.168.1.60');
  });

  it('shows the matched rule and its origin', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    // Daemon indexes count from zero, rules on the screen are numbered from one.
    expect(await screen.findByText('Сработало правило 7')).toBeInTheDocument();
    expect(screen.getByText('Сет правил: google-ip')).toHaveAttribute('title', 'rule_set=google-ip');
    expect(screen.getAllByText('от sing-box').length).toBeGreaterThan(0);
  });

  it('leads to the rule in the editor when the process list matches the config', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    const link = await screen.findByRole('link', { name: 'Открыть правило в редакторе' });

    expect(link).toHaveAttribute('href', '/config?rule=7');
    // Variant classes pass through `cn`: otherwise the base `border-transparent`
    // survives next to the variant `border-border`, and the link is left without a border.
    expect(link).toHaveClass('border-border');
    expect(link).not.toHaveClass('border-transparent');
  });

  it('disables the jump to the node when the process runs a different config', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(CONFIG_TEXT);

    renderWithRouter(() => (
      <RouteExplanation
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('sing-box работает на другой версии конфига')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть правило в редакторе' })).not.toBeInTheDocument();
    // The node number of a foreign document is not shown at all: it would point to
    // a different rule.
    expect(screen.queryByText('Сработало правило 7')).not.toBeInTheDocument();
    // The rule sing-box reported stays visible by its conditions, with its origin.
    expect(screen.getByText('Сработавшее правило по данным sing-box')).toBeInTheDocument();
    expect(screen.getByText('Сет правил: google-ip')).toBeInTheDocument();
    expect(screen.queryByText('Правило не определено')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть конфигурацию' })).toHaveAttribute('href', '/config');
    // Rule positions above are not those of the file either.
    expect(
      within(screen.getByRole('list', { name: 'Правила выше сработавшего' })).queryByText('1')
    ).not.toBeInTheDocument();
  });

  it('shows the default outbound as an observation, not as unknown', async () => {
    serveExplanation(ROUTE_FINAL_FIXTURE);
    serveConfig(configWithRules(ROUTE_FINAL_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
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
        connectionId='c-1'
        host='video.example:443'
        source='192.168.1.60'
        onClose={vi.fn<() => void>()}
      />
    ));

    expect(await screen.findByText('Правило не определено')).toBeInTheDocument();
    // The reason is the panel translation by the daemon code, not its string: it is in its language.
    expect(screen.getByText('правила этого соединения нет в списке работающего sing-box')).toBeInTheDocument();
    expect(screen.queryByText(ROUTE_UNKNOWN_FIXTURE.match.reason ?? '')).not.toBeInTheDocument();
    expect(screen.getByText('неизвестно')).toBeInTheDocument();
  });

  it('shows the chain in human reading order', async () => {
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
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
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    renderWithRouter(() => (
      <RouteExplanation
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
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));

    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithRouter(() => (
      <RouteExplanation connectionId='c-1' host='video.example:443' source='192.168.1.60' onClose={onClose} />
    ));

    await screen.findByRole('complementary');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RouteExplanationSheet', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    serveExplanation(ROUTE_EXPLANATION_FIXTURE);
    serveConfig(configWithRules(ROUTE_EXPLANATION_FIXTURE.rules.length));
    server.use(...createDeviceHandlers());
  });

  it('is open while a connection is selected, and is named after it', async () => {
    renderWithRouter(() => (
      <RouteExplanationSheet
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
      <RouteExplanationSheet connectionId={null} host='' source='' onClose={vi.fn<() => void>()} />
    ));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape and with the close button', async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithRouter(() => (
      <RouteExplanationSheet connectionId='c-1' host='video.example:443' source='192.168.1.60' onClose={onClose} />
    ));

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Закрыть объяснение' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
