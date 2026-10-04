import { renderWithRouter } from '@test/renderWithRouter';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState, findValue } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SectionNodes } from '../ui/SectionPage';

const CONFIG_TEXT = `{
  // выходы
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "vless", "tag": "hk-01", "server": "a.example" },
  ],
}`;

function serveConfig(text: string) {
  server.use(
    http.get(CONFIG_ENDPOINT.config(), () => HttpResponse.text(text)),
    http.get(DAEMON_ENDPOINT.status(), () => HttpResponse.json(DAEMON_STATUS_FIXTURE))
  );
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

function NtpSection() {
  return <SectionNodes section='ntp' />;
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

describe('экран секции', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('открывает узел аутбаунда формой, а тот же узел текстом — на вкладке JSON', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    expect(node.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(node.getByRole('textbox', { name: 'server' })).toHaveValue('a.example');

    await user.click(node.getByRole('tab', { name: 'JSON' }));

    expect(node.getByRole('textbox', { name: 'Узел hk-01 текстом' })).toHaveValue(
      JSON.stringify({ type: 'vless', tag: 'hk-01', server: 'a.example' }, null, 2)
    );
    expect(screen.getByRole('heading', { name: 'direct' })).toBeInTheDocument();
  });

  it('правка поля формой ложится одной строкой: комментарий и соседний узел целы', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));
    const server = node.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'b.example');
    await user.click(node.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(findValue(ConfigDocumentState.getState().draft ?? '{}', ['outbounds', 1, 'server'])).toBe('b.example');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';
    const lines = CONFIG_TEXT.split('\n');

    expect(draft.split('\n').filter((line, index) => line !== lines[index])).toHaveLength(1);
    expect(draft).toContain('// выходы');
    expect(findValue(draft, ['outbounds', 0])).toEqual({ type: 'direct', tag: 'direct' });
  });

  it('правка узла текстом уходит в черновик точечно: комментарий и соседний узел целы', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'direct' }));

    await user.click(node.getByRole('tab', { name: 'JSON' }));

    const editor = node.getByRole('textbox', { name: 'Узел direct текстом' });

    await user.clear(editor);
    await user.paste('{ "type": "direct", "tag": "main" }');
    await user.click(node.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"tag": "main"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('// выходы');
    expect(draft).toContain('"hk-01"');
  });

  it('пустая секция-список названа пустой, а не сломанной', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(ProvidersSection);

    expect(await screen.findByText('Узлов нет')).toBeInTheDocument();
  });

  it('правка DNS-правила ложится в dns.rules: серверы и комментарий целы', async () => {
    serveConfig(DNS_TEXT);

    const user = userEvent.setup();

    renderWithRouter(DnsRulesSection);

    const editor = await screen.findByRole('textbox', { name: 'Узел dns.rules[1] текстом' });

    await user.clear(editor);
    await user.paste('{ "query_type": ["HTTPS"], "action": "reject" }');

    const [, saveSecond] = screen.getAllByRole('button', { name: 'Сохранить в черновик' });

    await user.click(saveSecond);

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"HTTPS"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(findValue(draft, ['dns', 'rules', 1])).toEqual({ query_type: ['HTTPS'], action: 'reject' });
    expect(findValue(draft, ['dns', 'rules', 0])).toEqual({ domain: ['a.example'], server: 'local' });
    expect(findValue(draft, ['dns', 'servers'])).toEqual([{ type: 'local', tag: 'local' }]);
    expect(draft).toContain('// серверы');
  });

  it('узел без тега и типа назван путём в файле, а не именем вкладки', async () => {
    serveConfig(DNS_TEXT);

    renderWithRouter(DnsRulesSection);

    expect(await screen.findByRole('heading', { name: 'dns.rules[0]' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'dnsRules[0]' })).not.toBeInTheDocument();
  });

  it('отсутствующая ntp открывается пустым узлом, сохранение создаёт секцию', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(NtpSection);

    const editor = await screen.findByRole('textbox', { name: 'Узел ntp текстом' });

    expect(editor).toHaveValue('{}');

    await user.clear(editor);
    await user.paste('{ "enabled": true, "server": "time.example" }');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(findValue(ConfigDocumentState.getState().draft ?? '{}', ['ntp'])).toEqual({
        enabled: true,
        server: 'time.example',
      });
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(draft).toContain('// выходы');
    expect(findValue(draft, ['outbounds', 1])).toEqual({ type: 'vless', tag: 'hk-01', server: 'a.example' });
  });
});
