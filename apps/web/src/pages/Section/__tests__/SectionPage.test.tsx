import { renderWithRouter } from '@test/renderWithRouter';
import { selectOption } from '@test/selectOption';
import { server } from '@test/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_ENDPOINT, ConfigDocumentState, findValue } from '@entities/Config';
import { DAEMON_ENDPOINT } from '@entities/Daemon';
import { DAEMON_STATUS_FIXTURE } from '@entities/Daemon/__tests__/Daemon.fixture';

import { SectionNodes } from '../ui/SectionPage';

/** Узел VLESS из текста ниже: сервер, порт и UUID — то, без чего форма его не сохранит. */
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

  it('узлы секции свёрнуты до шапки с типом и адресом', async () => {
    serveConfig(CONFIG_TEXT);

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    expect(node.getByRole('button', { name: 'hk-01' })).toHaveAttribute('aria-expanded', 'false');
    expect(node.getByText('vless')).toBeInTheDocument();
    expect(node.getByText('a.example:443')).toBeInTheDocument();
    expect(node.queryByRole('tab', { name: 'Форма' })).not.toBeInTheDocument();
  });

  it('открывает узел аутбаунда формой, а тот же узел текстом — на вкладке JSON', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    await user.click(node.getByRole('button', { name: 'hk-01' }));

    expect(node.getByRole('tab', { name: 'Форма' })).toHaveAttribute('aria-selected', 'true');
    expect(node.getByRole('textbox', { name: 'server' })).toHaveValue('a.example');

    await user.click(node.getByRole('tab', { name: 'JSON' }));

    expect(node.getByRole('textbox', { name: 'Узел hk-01 текстом' })).toHaveValue(JSON.stringify(HK_01, null, 2));
    expect(screen.getByRole('heading', { name: 'direct' })).toBeInTheDocument();
  });

  it('правка поля формой ложится одной строкой: комментарий и соседний узел целы', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    const node = within(await screen.findByRole('region', { name: 'hk-01' }));

    await user.click(node.getByRole('button', { name: 'hk-01' }));

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

    await user.click(node.getByRole('button', { name: 'direct' }));

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

    const node = within(await screen.findByRole('region', { name: 'dns.rules[1]' }));

    await user.click(node.getByRole('button', { name: 'dns.rules[1]' }));

    const editor = node.getByRole('textbox', { name: 'Узел dns.rules[1] текстом' });

    await user.clear(editor);
    await user.paste('{ "query_type": ["HTTPS"], "action": "reject" }');

    await user.click(node.getByRole('button', { name: 'Сохранить в черновик' }));

    await waitFor(() => {
      expect(ConfigDocumentState.getState().draft).toContain('"HTTPS"');
    });

    const draft = ConfigDocumentState.getState().draft ?? '';

    expect(findValue(draft, ['dns', 'rules', 1])).toEqual({ query_type: ['HTTPS'], action: 'reject' });
    expect(findValue(draft, ['dns', 'rules', 0])).toEqual({ domain: ['a.example'], server: 'local' });
    expect(findValue(draft, ['dns', 'servers'])).toEqual([{ type: 'local', tag: 'local' }]);
    expect(draft).toContain('// серверы');
  });

  it('скаляры dns правятся формой над серверами: одна строка, серверы и комментарий целы', async () => {
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
    await user.click(settings.getByRole('button', { name: 'Сохранить в черновик' }));

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
    expect(findValue(draft, ['outbounds', 1])).toEqual(HK_01);
  });

  it('кнопка тулбара открывает панель с фокусом на заголовке, Escape закрывает и возвращает фокус', async () => {
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
    expect(open).toHaveFocus();
  });

  it('добавляет аутбаунд direct с тегом: узел ложится в конец секции, комментарий цел', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'direct');
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

  it('VLESS добавляется заготовкой оверрайда: TLS с uTLS и Reality уже включены', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'vless');
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

  it('отвергает тег, занятый другим узлом, и ничего не пишет', async () => {
    serveConfig(CONFIG_TEXT);

    const user = userEvent.setup();

    renderWithRouter(OutboundsSection);

    await user.click(await screen.findByRole('button', { name: 'Добавить узел' }));

    const panel = within(screen.getByRole('complementary', { name: 'Новый узел' }));

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'direct');
    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'hk-01');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    expect(await panel.findByRole('alert')).toHaveTextContent('Тег уже занят другим узлом');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('тип вне сборки бинаря помечен в выборе, но выбирается и добавляется', async () => {
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

    await selectOption(user, panel.getByRole('combobox', { name: 'Тип' }), 'hysteria2нет в сборке: with_quic');

    expect(panel.getByText(/собран без with_quic/)).toBeInTheDocument();

    await user.type(panel.getByRole('textbox', { name: 'Тег' }), 'hy2');
    await user.click(panel.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 2])).toEqual({ type: 'hysteria2', tag: 'hy2' });
    });
  });

  it('пустая секция с реестром добавляет первый узел и создаёт массив', async () => {
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

  it('у секции-объекта и списка без реестра кнопки добавления нет', async () => {
    serveConfig(DNS_TEXT);

    renderWithRouter(DnsRulesSection);

    expect(await screen.findByRole('heading', { name: 'dns.rules[0]' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить узел' })).not.toBeInTheDocument();
  });
});
