import { selectOption } from '@test/selectOption';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigDocumentState,
  findValue,
  isNodeRecognized,
  NODE_REGISTRY,
  useConfigText,
  type NodeRegistry,
} from '@entities/Config';

import { ConfigNodeForm } from '../ui/ConfigNodeForm';

const TEXT = `{
  // выходы
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    {
      "type": "vless",
      // узел в Гонконге
      "tag": "hk-01",
      "server": "a.example",
      "server_port": 443,
      "network": "tcp",
      "tls": {
        "enabled": true,
        "server_name": "a.example",
        "alpn": "h2",
      },
    },
  ],
}`;

const VLESS: JSONPath = ['outbounds', 1];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Узел читается из стора, как на экране: форма видит каждую правку текста. */
function NodeFromStore({ registry, path }: { registry: NodeRegistry; path: JSONPath }) {
  const text = useConfigText();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? <ConfigNodeForm registry={registry} path={path} node={node} /> : null;
}

function renderVless() {
  return render(<NodeFromStore registry={NODE_REGISTRY.Outbound} path={VLESS} />);
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

/** Строки, которыми черновик отличается от исходного текста. */
function changedLines(before: string, after: string): string[] {
  const lines = before.split('\n');

  return after.split('\n').filter((line, index) => line !== lines[index]);
}

function save() {
  return screen.getByRole('button', { name: 'Сохранить в черновик' });
}

describe('форма узла по схеме', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('рисует поле по его виду и не рисует тип узла', () => {
    renderVless();

    expect(screen.getByRole('textbox', { name: 'server' })).toHaveValue('a.example');
    expect(screen.getByRole('spinbutton', { name: 'server_port' })).toHaveValue(443);
    expect(screen.getByRole('switch', { name: 'tcp_fast_open' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'domain_strategy' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'connect_timeout' })).toHaveAttribute('placeholder', '10s, 1m30s');
    expect(screen.queryByRole('textbox', { name: 'type' })).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('правка поля ложится одной строкой: комментарий внутри узла цел', async () => {
    const user = userEvent.setup();

    renderVless();

    const server = screen.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'b.example');
    await user.click(save());

    await waitFor(() => {
      expect(changedLines(TEXT, draft())).toEqual(['      "server": "b.example",']);
    });
    expect(draft()).toContain('// узел в Гонконге');
    expect(save()).toBeDisabled();
  });

  it('очищенное поле удаляется из узла, а не пишется пустым', async () => {
    const user = userEvent.setup();

    renderVless();

    await user.clear(screen.getByRole('spinbutton', { name: 'server_port' }));
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), VLESS)).not.toHaveProperty('server_port');
    });
  });

  it('флаг сбрасывается до незаданного: ключ уходит из файла', async () => {
    const user = userEvent.setup();

    renderVless();

    // Группа tls задана в узле и открыта сразу.
    await user.click(screen.getByRole('button', { name: 'Сбросить enabled' }));
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls'])).toEqual({ server_name: 'a.example', alpn: 'h2' });
    });
  });

  it('listable из одной строки остаётся строкой, из двух — становится списком', async () => {
    const user = userEvent.setup();

    renderVless();

    const alpn = screen.getByRole('textbox', { name: 'alpn' });

    expect(alpn).toHaveValue('h2');

    await user.clear(alpn);
    await user.type(alpn, 'http/1.1');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls', 'alpn'])).toBe('http/1.1');
    });

    await user.type(alpn, '{Enter}h2');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls', 'alpn'])).toEqual(['http/1.1', 'h2']);
    });
  });

  it('набор значений пишется в порядке схемы', async () => {
    const user = userEvent.setup();

    renderVless();

    await user.click(screen.getByRole('button', { name: 'udp' }));
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'network'])).toEqual(['tcp', 'udp']);
    });
  });

  it('значение перечисления выбирается из схемы, пустой пункт снимает ключ', async () => {
    const user = userEvent.setup();

    renderVless();

    await selectOption(user, screen.getByRole('combobox', { name: 'domain_strategy' }), 'prefer_ipv4');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'domain_strategy'])).toBe('prefer_ipv4');
    });

    await selectOption(user, screen.getByRole('combobox', { name: 'domain_strategy' }), 'не задано');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), VLESS)).not.toHaveProperty('domain_strategy');
    });
  });

  it('группа без значений свёрнута, с значениями — открыта', async () => {
    const user = userEvent.setup();

    renderVless();

    expect(screen.getByRole('button', { name: 'Поля tls' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'server_name' })).toHaveValue('a.example');

    const multiplex = screen.getByRole('button', { name: 'Поля multiplex' });

    expect(multiplex).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('switch', { name: 'padding' })).not.toBeInTheDocument();

    await user.click(multiplex);

    expect(screen.getByRole('switch', { name: 'padding' })).toBeInTheDocument();
  });

  it('называет длительность не в том формате и не пишет её', async () => {
    const user = userEvent.setup();

    renderVless();

    await user.type(screen.getByRole('textbox', { name: 'connect_timeout' }), '10 секунд');

    expect(await screen.findByRole('alert')).toHaveTextContent('Длительность в формате 10s, 1m30s, 500ms');

    await user.click(save());

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('поле «строка или число» пишет цифры числом', async () => {
    const user = userEvent.setup();

    renderVless();

    await user.type(screen.getByRole('textbox', { name: 'routing_mark' }), '255');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'routing_mark'])).toBe(255);
    });
  });

  it('незнакомый вид правится JSON-текстом, неразобранный текст запись останавливает', async () => {
    const user = userEvent.setup();

    renderVless();

    const resolver = screen.getByRole('textbox', { name: 'domain_resolver' });

    await user.click(resolver);
    await user.paste('{ "server": ');

    expect(screen.getByRole('alert')).toHaveTextContent('JSON не разобран');

    await user.click(save());

    expect(ConfigDocumentState.getState().draft).toBeNull();

    await user.paste('"local" }');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'domain_resolver'])).toEqual({ server: 'local' });
    });
  });

  it('неразобранный текст, переписанный правкой узла снаружи, запись не держит', async () => {
    const user = userEvent.setup();

    renderVless();

    const resolver = screen.getByRole('textbox', { name: 'domain_resolver' });

    await user.click(resolver);
    await user.paste('{ "server": ');

    ConfigDocumentState.getState().edit([...VLESS, 'domain_resolver'], 'local');

    await waitFor(() => {
      expect(resolver).toHaveValue('"local"');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const server = screen.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'b.example');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'server'])).toBe('b.example');
    });
    expect(findValue(draft(), [...VLESS, 'domain_resolver'])).toBe('local');
  });

  it('правка того же узла текстом доходит до формы, набранное не стирается', async () => {
    const user = userEvent.setup();

    renderVless();

    const server = screen.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'typed.example');

    ConfigDocumentState.getState().edit([...VLESS, 'uuid'], 'REDACTED');

    expect(await screen.findByDisplayValue('REDACTED')).toBeInTheDocument();
    expect(server).toHaveValue('typed.example');
  });
});

/**
 * Golden на корпусе: узел реального вида правится формой, и файл меняется
 * ровно на одну строку — остальные байты, комментарии и порядок ключей целы.
 */
const CORPUS = import.meta.glob<string>('/src/entities/Config/__tests__/corpus/*.json*', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Самый развёрнутый распознанный аутбаунд файла с тегом: правится его форма —
 * в нём больше всего соседних строк, которые правка обязана не тронуть.
 */
function richestOutbound(text: string): number | null {
  const outbounds = findValue(text, ['outbounds']);
  let found: { index: number; size: number } | null = null;

  for (const [index, node] of (Array.isArray(outbounds) ? outbounds : []).entries()) {
    const size = isRecord(node) ? Object.keys(node).length : 0;

    if (
      isRecord(node) &&
      typeof node.tag === 'string' &&
      isNodeRecognized(NODE_REGISTRY.Outbound, node) &&
      size > (found?.size ?? 0)
    ) {
      found = { index, size };
    }
  }

  return found?.index ?? null;
}

const GOLDEN = Object.entries(CORPUS).flatMap(([path, text]) => {
  const index = richestOutbound(text);

  return index === null ? [] : [{ name: path.split('/').at(-1), text, index }];
});

/** Строки комментариев файла: правка формой не вправе их трогать. */
function commentLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => /^\s*(?:\/\/|\/\*)/.test(line));
}

describe('форма узла на корпусе конфигов', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('в корпусе есть узлы для правки', () => {
    expect(GOLDEN.length).toBeGreaterThan(0);
  });

  it.each(GOLDEN)('$name: правка тега формой меняет одну строку файла', async ({ text, index }) => {
    const user = userEvent.setup();
    const path = ['outbounds', index];

    ConfigDocumentState.getState().load(text);
    render(<NodeFromStore registry={NODE_REGISTRY.Outbound} path={path} />);

    const tag = screen.getByRole('textbox', { name: 'tag' });

    await user.type(tag, '-edited');
    await user.click(save());

    await waitFor(() => {
      expect(changedLines(text, draft())).toHaveLength(1);
    });
    expect(changedLines(text, draft())[0]).toContain('-edited"');
    expect(draft().split(/\r?\n/)).toHaveLength(text.split(/\r?\n/).length);
    expect(commentLines(draft())).toEqual(commentLines(text));
  });
});
