import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { renderWithQuery } from '@test/renderWithQuery';
import { server } from '@test/server';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ENDPOINT, CONFIG_SECTION, ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import {
  CLASH_CONFIGS_FIXTURE,
  DAEMON_STATUS_FIXTURE,
  SERVICE_RUNNING_FIXTURE,
  TRAFFIC_HISTORY_FIXTURE,
} from '@entities/Daemon/__tests__/Daemon.fixture';
import { PROXY_ENDPOINT } from '@entities/Proxy';
import { NARROW_SCREEN } from '@shared/lib/media';

import { createPanelRouter } from '../Router';

function serveDaemon() {
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE)),
    http.get(DAEMON_ENDPOINT.service(), () => HttpResponse.json(SERVICE_RUNNING_FIXTURE)),
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(MINIMAL_CONFIG)),
    http.get(CONFIG_ENDPOINT.versions(), () => HttpResponse.json({ versions: [] }))
  );
}

/** The screen only needs a parsable config: the rule list is not checked here. */
const MINIMAL_CONFIG = JSON.stringify({ route: { rules: [{ outbound: 'direct' }] } }, null, 2);

/** jsdom has no `matchMedia`: answer only the narrow-width query. */
function mockNarrowScreen() {
  vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
    return {
      matches: media === NARROW_SCREEN,
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    };
  });
}

/**
 * Overview reads the runtime stream, and the shell opens an `EventSource` that
 * jsdom lacks: without a stub the route would fall into the error screen. Frames
 * are not needed here: the test checks which screen opened.
 */
class SilentEventSource {
  addEventListener(): void {
    // No frames will come: nothing to listen to.
  }

  removeEventListener(): void {
    // No subscriptions: nothing to remove.
  }

  close(): void {
    // No connection: nothing to close.
  }
}

/** A router per test: opens straight at the needed address and does not share it with neighbors. */
function renderRouter(path = '/') {
  const router = createPanelRouter(createMemoryHistory({ initialEntries: [path] }));

  renderWithQuery(<RouterProvider router={router} />);

  return router;
}

describe('panel routes', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the configuration from the root: there is no empty screen at /', async () => {
    serveDaemon();

    const router = renderRouter();

    // The screen heading repeats the menu item name, so the screen is identified
    // by the file path, which exists only on the page itself.
    await waitFor(() => {
      expect(screen.getByText('/etc/sing-box/config.json')).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/config');
  });

  // People open the router from a phone to check that everything works, not to edit the config.
  it('on a phone opens Overview from the root', async () => {
    serveDaemon();
    server.use(
      http.get(DAEMON_ENDPOINT.clashConfigs(), () => HttpResponse.json(CLASH_CONFIGS_FIXTURE)),
      http.get(PROXY_ENDPOINT.proxies(), () => HttpResponse.json({ proxies: {} })),
      http.get(DAEMON_ENDPOINT.history(), () => HttpResponse.json(TRAFFIC_HISTORY_FIXTURE))
    );
    mockNarrowScreen();
    vi.stubGlobal('EventSource', SilentEventSource);

    const router = renderRouter();

    expect(await screen.findByRole('heading', { level: 1, name: 'Обзор' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/overview');

    const nav = screen.getByRole('navigation', { name: 'Разделы панели' });

    expect(within(nav).getByRole('link', { current: 'page' })).toHaveAttribute('href', '/overview');
  });

  // The rule sets section is done, and its menu item must lead to it: an item without
  // a route looks the same as a working one and lies about the panel state.
  it('in the navigation, finished sections lead to their routes', async () => {
    serveDaemon();

    renderRouter();

    await screen.findByRole('navigation', { name: 'Разделы панели' });

    // The item is checked by address, not by label: the label is subject to text edits,
    // while the menu promises where it leads.
    const targets = [...screen.getAllByRole('link'), ...screen.getAllByRole('tab')].map((link) =>
      link.getAttribute('href')
    );

    expect(targets).toContain('/config');
    expect(targets).toContain('/config/rule-set');
  });

  // Rare sections do not take up the strip, but do not vanish either: they are in the "More" menu
  // next to it, and a selected rare one appears in the strip as a tab while selected.
  it('every section is reachable: frequent and selected ones as tabs, the rest in the "More" menu', async () => {
    serveDaemon();
    const user = userEvent.setup();

    renderRouter('/config/log');

    const sections = await screen.findByRole('tablist', { name: 'Секции конфига' });
    const tabs = within(sections).getAllByRole('tab');

    expect(within(sections).getByRole('tab', { selected: true })).toHaveAttribute('href', '/config/log');

    await user.click(screen.getByRole('button', { name: 'Ещё' }));

    const items = await screen.findAllByRole('menuitem');

    const targets = [...tabs, ...items].map((link) => link.getAttribute('href'));

    expect(new Set(targets).size).toBe(Object.values(CONFIG_SECTION).length);
    expect(targets).toHaveLength(Object.values(CONFIG_SECTION).length);

    // The section is not in the file: the editor offers an empty node, saving will create it.
    expect(await screen.findByRole('textbox', { name: 'Узел log текстом' })).toHaveValue('{}');
  });

  it('the "More" menu item opens a section, and it becomes the selected tab', async () => {
    serveDaemon();
    const user = userEvent.setup();

    const router = renderRouter('/config');

    const frequent = within(await screen.findByRole('tablist', { name: 'Секции конфига' })).getAllByRole('tab').length;

    await user.click(screen.getByRole('button', { name: 'Ещё' }));
    await user.click(await screen.findByRole('menuitem', { name: 'NTP' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/config/ntp');
    });

    const sections = screen.getByRole('tablist', { name: 'Секции конфига' });

    expect(within(sections).getByRole('tab', { selected: true })).toHaveTextContent('NTP');
    expect(within(sections).getAllByRole('tab')).toHaveLength(frequent + 1);
  });

  // Text mode is the second axis of the section, not a way out of it: sections answer
  // "which part am I looking at", the mode answers "forms or text".
  it('text mode stays inside the section: tabs and switch are in place', async () => {
    serveDaemon();

    renderRouter('/config/raw');

    const sections = await screen.findByRole('tablist', { name: 'Секции конфига' });
    const targets = within(sections)
      .getAllByRole('tab')
      .map((tab) => tab.getAttribute('href'));

    expect(targets).toContain('/config');
    expect(targets).toContain('/config/rule-set');

    const mode = screen.getByRole('tablist', { name: 'Как показан документ' });
    const current = within(mode).getAllByRole('tab', { current: 'page' });

    expect(within(mode).getByRole('tab', { selected: true })).toHaveAttribute('href', '/config/raw');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config/raw');
  });

  // The section header belongs to the layout, not to a tab: a copy on each tab
  // drifts in font size and in the contents of the right part.
  it('the header and version history exist in the section as a single instance', async () => {
    serveDaemon();

    renderRouter('/config/rule-set');

    expect(await screen.findAllByRole('heading', { level: 1, name: 'Конфигурация' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'История версий' })).toHaveLength(1);
  });

  // Outside /config/raw the strip picks "Forms" by the section address, and `Link`
  // does not mark it as the current page: `/config` is active only on an exact match.
  it('on the rule sets tab the current mode stays "Forms"', async () => {
    serveDaemon();

    renderRouter('/config/rule-set');

    const mode = await screen.findByRole('tablist', { name: 'Как показан документ' });

    expect(within(mode).getByRole('tab', { selected: true })).toHaveAttribute('href', '/config');
    expect(within(mode).queryAllByRole('tab', { current: 'page' })).toHaveLength(0);
  });

  // A dictionary not preloaded by the loader pushes part of the screen into `Suspense`: the
  // "Custom rule set" form opens through a fallback instead of text. In the test the dictionaries are
  // in memory, so what is checked is what the loader asks for.
  it('the rule sets loader preloads dictionaries of every slice the screen shows', async () => {
    serveDaemon();
    const loadNamespaces = vi.spyOn(i18next, 'loadNamespaces');

    renderRouter('/config/rule-set');

    await screen.findAllByRole('heading', { level: 1, name: 'Конфигурация' });

    const requested = loadNamespaces.mock.calls.flatMap(([namespaces]) => [namespaces].flat());

    expect(requested).toEqual(
      expect.arrayContaining([
        'pages/RuleSets',
        'widgets/RuleSet/RuleSetTable',
        'features/RuleSet/RuleSetAdd',
        'features/RuleSet/RuleSetCustom',
        'features/Config/ConfigCacheFile',
      ])
    );
  });

  // The draft badge belongs to the section header and is visible from any of its tabs.
  it('the draft badge is shown by the section header, and there is one', async () => {
    serveDaemon();

    renderRouter();

    await waitFor(() => {
      expect(screen.getByText('/etc/sing-box/config.json')).toBeInTheDocument();
    });

    expect(screen.queryByText('черновик')).not.toBeInTheDocument();

    act(() => {
      ConfigDocumentState.getState().replace(`${MINIMAL_CONFIG}\n`);
    });

    expect(screen.getAllByText('черновик')).toHaveLength(1);
  });

  // An unknown path must not crash the shell: without its own fallback TanStack
  // Router renders a bare "Not Found" with no sidebar and no translation.
  it('on an unknown path shows a translated fallback together with the panel navigation', async () => {
    serveDaemon();

    renderRouter('/nope');

    expect(await screen.findByRole('heading', { name: 'Такой страницы нет' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Разделы панели' })).toBeInTheDocument();
  });

  // Section tabs live at their own addresses, and an exact link match would deactivate
  // "Configuration" on all but the first.
  it('in the navigation exactly one item is marked current, even when the address is nested in another', async () => {
    serveDaemon();

    renderRouter('/config/rule-set');

    // Configuration tabs are a separate navigation with its own current item.
    const sidebar = await screen.findByRole('navigation', { name: 'Разделы панели' });
    const current = within(sidebar).getAllByRole('link', { current: 'page' });

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', '/config');
  });
});
