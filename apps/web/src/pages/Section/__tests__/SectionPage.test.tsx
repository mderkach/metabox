import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { finishSidePanelTransition } from '@test/sidePanel';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState, findValue } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SectionNodes } from '../ui/SectionPage';

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
  server.use(
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

function DnsRulesSection() {
  return <SectionNodes section='dnsRules' />;
}

function DnsSection() {
  return <SectionNodes section='dns' />;
}

function NtpSection() {
  return <SectionNodes section='ntp' />;
}

function ExperimentalSection() {
  return <SectionNodes section='experimental' />;
}

const DNS_TEXT = `{
  "dns": {
    // серверы
    "servers": [{ "type": "local", "tag": "local" }],
    "rules": [
      { "domain": ["a.example"], "server": "local" },
      { "query_type": ["AAAA"], "action": "reject" },
    ],
  },
}`;

describe('section screen', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('section nodes are collapsed to a header with type and address', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    expect(node.getByRole('button', { name: 'hk-01' })).toHaveAttribute('aria-expanded', 'false');
    expect(node.getByText('vless')).toBeInTheDocument();
    expect(node.getByText('a.example:443')).toBeInTheDocument();
    expect(node.queryByRole('tab', { name: 'Форма' })).not.toBeInTheDocument();
  });

  it('opens an outbound node with a form, and the same node as text on the JSON tab', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    await user.click(node.getByRole('button', { name: 'hk-01' }));

    expect(node.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(node.getByRole('textbox', { name: 'Сервер' })).toHaveValue('a.example');

    await user.click(node.getByRole('tab', { name: 'JSON' }));

    expect(node.getByRole('textbox', { name: 'Узел hk-01 текстом' })).toHaveValue(JSON.stringify(HK_01, null, 2));
    expect(screen.getByRole('heading', { name: 'direct' })).toBeInTheDocument();
  });

  it('a field edit by the form lands as one line: the comment and the neighboring node are intact', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    await user.click(node.getByRole('button', { name: 'hk-01' }));

    const server = node.getByRole('textbox', { name: 'Сервер' });

    await user.clear(server);
    await user.type(server, 'b.example');

    await waitFor(() => {
      expect(findValue(ConfigDocumentState.getState().draft ?? '{}', ['outbounds', 1, 'server'])).toBe('b.example');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';
    const lines = CONFIG_TEXT.split('\n');

    expect(draft.split('\n').filter((line, index) => line !== lines[index])).toHaveLength(1);
    expect(draft).toContain('// выходы');
    expect(findValue(draft, ['outbounds', 0])).toEqual({ type: 'direct', tag: 'direct' });
  });

  it('a node edit by text goes into the draft precisely: the comment and the neighboring node are intact', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'direct' }));

    await user.click(node.getByRole('button', { name: 'direct' }));

    await user.click(node.getByRole('tab', { name: 'JSON' }));

    const editor = node.getByRole('textbox', { name: 'Узел direct текстом' });

    await user.clear(editor);
    await user.paste('{ "type": "direct", "tag": "main" }');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"tag": "main"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('// выходы');
    expect(draft).toContain('"hk-01"');
  });

  it('an empty list section is called empty, not broken', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(ProvidersSection);

    expect(await screen.findByText('Узлов нет')).toBeInTheDocument();
  });

  it('a DNS rule edit lands in dns.rules: servers and the comment are intact', async () => {
    serveConfig(DNS_TEXT);

    const user = userEvent.setup();

    renderWithRouter(DnsRulesSection);

    const node = within(await screen.findByRole('region', { name: 'dns.rules[1]' }));

    await user.click(node.getByRole('button', { name: 'dns.rules[1]' }));

    const editor = node.getByRole('textbox', { name: 'Узел dns.rules[1] текстом' });

    await user.clear(editor);
    await user.paste('{ "query_type": ["HTTPS"], "action": "reject" }');

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"HTTPS"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(findValue(draft, ['dns', 'rules', 1])).toEqual({ query_type: ['HTTPS'], action: 'reject' });
    expect(findValue(draft, ['dns', 'rules', 0])).toEqual({ domain: ['a.example'], server: 'local' });
    expect(findValue(draft, ['dns', 'servers'])).toEqual([{ type: 'local', tag: 'local' }]);
    expect(draft).toContain('// серверы');
  });

  it('dns scalars are edited by the form above the servers: one line, servers and the comment are intact', async () => {
    const text = `{
  "dns": {
    // серверы
    "servers": [{ "type": "local", "tag": "local" }],
    "final": "local",
  },
}`;
    const user = userEvent.setup();

    serveConfig(text);
    renderWithRouter(DnsSection);

    const settings = within(await screen.findByRole('region', { name: 'Параметры DNS' }));

    expect(screen.getByRole('region', { name: 'local' })).toBeInTheDocument();

    await user.click(settings.getByRole('button', { name: 'Параметры DNS' }));
    await user.clear(settings.getByRole('textbox', { name: 'final' }));
    await user.type(settings.getByRole('textbox', { name: 'final' }), 'remote');

    await waitFor(() => {
      expect(findValue(draft(), ['dns', 'final'])).toBe('remote');
    });
    expect(
      draft()
        .split('\n')
        .filter((line, index) => line !== text.split('\n')[index])
    ).toEqual(['    "final": "remote",']);
    expect(draft()).toContain('// серверы');
    expect(findValue(draft(), ['dns', 'servers', 0, 'tag'])).toBe('local');
  });

  it('experimental opens with a form: the secret is hidden, its edit lands as one line', async () => {
    const text = `{
  "experimental": {
    // панель
    "clash_api": { "external_controller": "127.0.0.1:9090", "secret": "old" },
  },
}`;
    const user = userEvent.setup();

    serveConfig(text);
    renderWithRouter(ExperimentalSection);

    const node = within(await screen.findByRole('region', { name: 'experimental' }));
    const secret = node.getByLabelText('secret');

    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(secret).toHaveAttribute('type', 'password');

    await user.clear(secret);
    await user.type(secret, 'new');

    await waitFor(() => {
      expect(findValue(draft(), ['experimental', 'clash_api', 'secret'])).toBe('new');
    });
    expect(
      draft()
        .split('\n')
        .filter((line, index) => line !== text.split('\n')[index])
    ).toEqual(['    "clash_api": { "external_controller": "127.0.0.1:9090", "secret": "new" },']);
  });

  it('a node without a tag and type is named by the path in the file, not by the tab name', async () => {
    serveConfig(DNS_TEXT);

    renderWithRouter(DnsRulesSection);

    expect(await screen.findByRole('heading', { name: 'dns.rules[0]' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'dnsRules[0]' })).not.toBeInTheDocument();
  });

  it('a missing ntp opens as an empty node, saving creates the section', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(NtpSection);

    const editor = await screen.findByRole('textbox', { name: 'Узел ntp текстом' });

    expect(editor).toHaveValue('{}');

    await user.clear(editor);
    await user.paste('{ "enabled": true, "server": "time.example" }');

    await waitFor(() => {
      expect(findValue(ConfigDocumentState.getState().draft ?? '{}', ['ntp'])).toEqual({
        enabled: true,
        server: 'time.example',
      });
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('// выходы');
    expect(findValue(draft, ['outbounds', 1])).toEqual(HK_01);
  });

  it('the toolbar button opens a panel with focus on the heading, Escape closes and returns focus', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const open = await screen.findByRole('button', { name: 'Добавить узел' });

    await user.click(open);

    const panel = screen.getByRole('complementary', { name: 'Новый узел' });

    expect(within(panel).getByRole('heading', { name: 'Новый узел' })).toHaveFocus();
    expect(open).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    finishSidePanelTransition();

    expect(open).toHaveFocus();
  });

  it('adds a direct outbound with a tag: the node goes to the end of the section, the comment is intact', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'directНапрямую, без прокси');
    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'direct-2');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({ type: 'direct', tag: 'direct-2' });
    });
    expect(draft()).toContain('// выходы');
    expect(findValue(draft(), ['outbounds', 1])).toEqual(HK_01);
    expect(await screen.findByRole('region', { name: 'direct-2' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Новый узел' })).not.toBeInTheDocument();
    });
  });

  it('VLESS is added from the override preset: TLS with uTLS and Reality are already on', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(
      user,
      panel.getByRole('combobox', { name: 'Тип' }),
      'vlessVLESS: лёгкий прокси, обычно с Reality или TLS'
    );
    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'vless-out');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({
        type: 'vless',
        tag: 'vless-out',
        tls: { enabled: true, utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true } },
      });
    });
  });

  it('adds an outbound from a share link and opens it in the node form', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();
    const publicKey = 'jNXHt1yRo0vDuchQlIP6Z0ZvjT3KtzVI-T4E7RoLJS0';

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await user.click(panel.getByRole('textbox', { name: 'Вставить ссылку' }));
    await user.paste(
      `vless://${HK_01.uuid}@b.example:8443?security=reality&sni=www.example&fp=chrome&pbk=${publicKey}&sid=ab#nl-01`
    );
    await user.click(panel.getByRole('button', { name: 'Добавить по ссылке' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({
        type: 'vless',
        tag: 'nl-01',
        server: 'b.example',
        server_port: 8443,
        uuid: HK_01.uuid,
        tls: {
          enabled: true,
          server_name: 'www.example',
          utls: { enabled: true, fingerprint: 'chrome' },
          reality: { enabled: true, public_key: publicKey, short_id: 'ab' },
        },
      });
    });
    expect(draft()).toContain('// выходы');

    const node = within(await screen.findByRole('region', { name: 'nl-01' }));

    expect(await node.findByRole('textbox', { name: 'Сервер' })).toHaveValue('b.example');
  });

  it('names a link it cannot read and writes nothing', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await user.click(panel.getByRole('textbox', { name: 'Вставить ссылку' }));
    await user.paste('https://provider.example/sub/token');
    await user.click(panel.getByRole('button', { name: 'Добавить по ссылке' }));

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Ссылка не распознана: поддерживаются vless://, vmess://, trojan://, ss:// и hysteria2://'
    );
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('rejects a tag taken by another node and writes nothing', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'directНапрямую, без прокси');
    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'hk-01');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('Тег уже занят другим узлом');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('a type outside the binary build is marked in the choice, but is chosen and added', async () => {
    let statusServed = false;

    server.use(
      http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(CONFIG_TEXT)),
      http.get(DAEMON_ENDPOINT.status(), () => {
        statusServed = true;

        return HttpResponse.json({ ...DAEMON_STATUS_FIXTURE, singbox_build: { tags: ['with_utls'] } });
      })
    );

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));
    await waitFor(() => {
      expect(statusServed).toBe(true);
    });

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(
      user,
      panel.getByRole('combobox', { name: 'Тип' }),
      'hysteria2недоступен в этой сборке sing-boxHysteria 2: быстрый прокси поверх QUIC'
    );

    expect(panel.getByText(/собран без этого типа \(with_quic\)/)).toBeInTheDocument();

    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'hy2');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({ type: 'hysteria2', tag: 'hy2' });
    });
  });

  it('an empty section with a registry adds the first node and creates the array', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(ProvidersSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'inline');
    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'own');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['providers'])).toEqual([{ type: 'inline', tag: 'own' }]);
    });
    expect(draft()).toContain('// выходы');
  });

  it('an object section and a list without a registry have no add button', async () => {
    serveConfig(DNS_TEXT);

    renderWithRouter(DnsRulesSection);

    expect(await screen.findByRole('heading', { name: 'dns.rules[0]' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить узел' })).not.toBeInTheDocument();
  });
});
