import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { FunctionComponent } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { ConfigApplyDiff } from '../ui/ConfigApplyDiff';

/** The router renders its route after a tick: the screen is queried once it is there. */
async function renderScreen(Component: FunctionComponent) {
  const { router } = renderWithRouter(Component);

  await act(async () => {
    await router.load();
  });
}

const JSON_INDENT = 2;

function serveConfirmWindow(seconds: number) {
  server.use(
    http.get(DAEMON_ENDPOINT.status(), () =>
      HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, confirm_window_seconds: seconds })
    )
  );
}

function toConfigText(config: unknown): string {
  return JSON.stringify(config, null, JSON_INDENT);
}

function toText(rules: unknown[]): string {
  return toConfigText({ route: { rules } });
}

async function openDiff(applied: unknown[], draft: unknown[]) {
  ConfigDocumentState.getState().load(toText(applied));
  ConfigDocumentState.getState().replace(toText(draft));
  await renderScreen(function Screen() {
    return <ConfigApplyDiff canApply blocked={null} onApply={() => undefined} />;
  });

  await userEvent.click(screen.getByRole('button', { name: 'Применить' }));
}

const RULES = Array.from({ length: 8 }, (_, index) => ({
  domain_suffix: `site-${String(index)}.example`,
  outbound: 'proxy',
}));

describe('ConfigApplyDiff', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    serveConfirmWindow(DAEMON_STATUS_FIXTURE.confirm_window_seconds);
  });

  it.each([
    [90, 'у вас будет 90 секунд, чтобы подтвердить'],
    [120, 'у вас будет 2 минуты, чтобы подтвердить'],
  ])('names the %i s confirmation window the daemon reports', async (seconds, text) => {
    serveConfirmWindow(seconds);

    await openDiff(RULES.slice(0, 1), RULES.slice(0, 2));

    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
  });

  it('above the diff summarizes rule edits in words, numbered as in the rule list', async () => {
    const draft = RULES.slice(0, 7).map((rule, index) => (index === 1 ? { ...rule, outbound: 'direct' } : rule));

    await openDiff(RULES.slice(0, 7), [
      ...draft.filter((_, index) => index !== 4),
      { ip_is_private: true, outbound: 'direct' },
    ]);

    const summary = await screen.findByRole('list', { name: 'Изменения правил маршрутизации' });

    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Правило 2: proxy → direct', 'Правило 5 удалено', 'Правило 7 добавлено']);
  });

  it('names a moved rule a move, not a deletion and an addition', async () => {
    const [first, second, ...rest] = RULES;

    await openDiff(RULES, [second, first, ...rest]);

    const summary = await screen.findByRole('list', { name: 'Изменения правил маршрутизации' });

    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Правило 1 перемещено на место 2']);
  });

  it('truncates a long summary and says how many remain', async () => {
    await openDiff([], RULES);

    const summary = await screen.findByRole('list', { name: 'Изменения правил маршрутизации' });
    const items = within(summary).getAllByRole('listitem');

    expect(items).toHaveLength(6);
    expect(items.at(-1)).toHaveTextContent('И ещё 3 изменения');
  });

  it('names node and parameter edits in words and folds the text of the changes under them', async () => {
    ConfigDocumentState.getState().load(
      toConfigText({ outbounds: [{ type: 'direct', tag: 'direct' }], route: { default_mark: 100 } })
    );
    ConfigDocumentState.getState().replace(
      toConfigText({
        outbounds: [
          { type: 'direct', tag: 'direct' },
          { type: 'vless', tag: 'NL test', server: 'nl.example' },
        ],
        route: { default_mark: 7 },
      })
    );
    await renderScreen(function Screen() {
      return <ConfigApplyDiff canApply blocked={null} onApply={() => undefined} />;
    });

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    const summary = await screen.findByRole('list', { name: 'Изменения узлов и параметров' });

    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Добавлено: аутбаунд NL test', 'Параметр route.default_mark: 100 → 7']);
    expect(within(summary).getByRole('link', { name: 'NL test' })).toHaveAttribute('href', '/config/outbounds');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Текст изменений/ }));

    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('closes the summary when a link leads to the edit', async () => {
    await openDiff(RULES.slice(0, 2), [RULES[0], { ...RULES[1], outbound: 'direct' }]);

    await userEvent.click(await screen.findByRole('link', { name: 'Правило 2' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the text at once when no summary line names the edit', async () => {
    ConfigDocumentState.getState().load('{\n  "log": { "level": "info" }\n}');
    ConfigDocumentState.getState().replace('{\n  // verbose\n  "log": { "level": "info" }\n}');
    await renderScreen(function Screen() {
      return <ConfigApplyDiff canApply blocked={null} onApply={() => undefined} />;
    });

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('colors an added line with the success tone, a removed one with the danger tone, and keeps the sign', async () => {
    ConfigDocumentState.getState().load('{\n  "log": { "level": "info" }\n}');
    ConfigDocumentState.getState().replace('{\n  "log": { "level": "debug" }\n}');
    await renderScreen(function Screen() {
      return <ConfigApplyDiff canApply blocked={null} onApply={() => undefined} />;
    });

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));
    await userEvent.click(await screen.findByRole('button', { name: /Текст изменений/ }));

    const added = await screen.findByRole('row', { name: /"debug"/ });
    const removed = screen.getByRole('row', { name: /"info"/ });

    expect(added).toHaveClass('text-signal-ok');
    expect(added).toHaveTextContent('+ "log": { "level": "debug" }');
    expect(removed).toHaveClass('text-destructive');
    expect(removed).toHaveTextContent('− "log": { "level": "info" }');
  });
});
