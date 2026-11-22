import { worker } from '@test/browserWorker';
import { renderWithRouter } from '@test/renderWithRouter';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { CONFIG_ENDPOINT, ConfigDocumentState, findValue } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SectionNodes } from '../ui/SectionNodes';

/** A VLESS node from the text below: server, port and UUID are what the form will not save it without. */
const HK_01 = { type: 'vless', tag: 'hk-01', server: 'a.example', server_port: 443, uuid: 'REDACTED' };

const CONFIG_TEXT = `{
  // выходы
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "vless", "tag": "hk-01", "server": "a.example", "server_port": 443, "uuid": "REDACTED" },
  ],
}`;

function serveConfig(text: string) {
  worker.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

function OutboundsSection() {
  return <SectionNodes section='outbounds' />;
}

function ProvidersSection() {
  return <SectionNodes section='providers' />;
}

/** Opens the add panel. */
async function openAddPanel() {
  await userEvent.click(await screen.findByRole('button', { name: 'Добавить запись' }));
}

/** Opens a dropdown and picks an option with the mouse. */
async function pick(trigger: HTMLElement, name: string | RegExp): Promise<void> {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name }));
}

// The side panel is a column only on a wide screen; below that it is a sheet.
beforeEach(async () => {
  ConfigDocumentState.getState().reset();
  await page.viewport(1280, 900);
});

describe('section screen picked with the mouse', () => {
  it('adds a direct outbound with a tag: the node goes to the end of the section, the comment is intact', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(OutboundsSection);

    await openAddPanel();

    const panel = within(screen.getByRole('complementary', { name: 'Новая запись' }));

    await pick(panel.getByRole('combobox', { name: 'Тип' }), /^direct/);
    await userEvent.type(panel.getByRole('textbox', { name: 'Тег' }), 'direct-2');
    await userEvent.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({ type: 'direct', tag: 'direct-2' });
    });
    expect(draft()).toContain('// выходы');
    expect(findValue(draft(), ['outbounds', 1])).toEqual(HK_01);
    expect(await screen.findByRole('complementary', { name: 'direct-2' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Новая запись' })).not.toBeInTheDocument();
    });
  });

  it('VLESS is added from the override preset: TLS with uTLS and Reality are already on', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(OutboundsSection);

    await openAddPanel();

    const panel = within(screen.getByRole('complementary', { name: 'Новая запись' }));

    await pick(panel.getByRole('combobox', { name: 'Тип' }), /^vless/);
    await userEvent.type(panel.getByRole('textbox', { name: 'Тег' }), 'vless-out');
    await userEvent.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({
        type: 'vless',
        tag: 'vless-out',
        tls: { enabled: true, utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true } },
      });
    });
  });

  it('rejects a tag taken by another node and writes nothing', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(OutboundsSection);

    await openAddPanel();

    const panel = within(screen.getByRole('complementary', { name: 'Новая запись' }));

    await pick(panel.getByRole('combobox', { name: 'Тип' }), /^direct/);
    await userEvent.type(panel.getByRole('textbox', { name: 'Тег' }), 'hk-01');
    await userEvent.click(panel.getByRole('button', { name: 'Добавить' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('Тег уже занят другой записью');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('a type outside the binary build is marked in the choice, but is chosen and added', async () => {
    let statusServed = false;

    worker.use(
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG_TEXT)),
      http.get(DAEMON_ENDPOINT.status(), () => {
        statusServed = true;

        return HttpResponse.json({
          ...DAEMON_STATUS_FIXTURE,
          core: { ...DAEMON_STATUS_FIXTURE.core, build: { tags: ['with_utls'] } },
        });
      })
    );

    renderWithRouter(OutboundsSection);

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить запись' }));
    await waitFor(() => {
      expect(statusServed).toBe(true);
    });

    const panel = within(screen.getByRole('complementary', { name: 'Новая запись' }));

    await pick(panel.getByRole('combobox', { name: 'Тип' }), /^hysteria2/);

    expect(panel.getByText(/нет этого типа \(with_quic\)/)).toBeInTheDocument();

    await userEvent.type(panel.getByRole('textbox', { name: 'Тег' }), 'hy2');
    await userEvent.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({ type: 'hysteria2', tag: 'hy2' });
    });
  });

  it('an empty section with a registry adds the first node and creates the array', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(ProvidersSection);

    await openAddPanel();

    const panel = within(screen.getByRole('complementary', { name: 'Новая запись' }));

    await pick(panel.getByRole('combobox', { name: 'Тип' }), 'inline');
    await userEvent.type(panel.getByRole('textbox', { name: 'Тег' }), 'own');
    await userEvent.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['providers'])).toEqual([{ type: 'inline', tag: 'own' }]);
    });
    expect(draft()).toContain('// выходы');
  });
});
