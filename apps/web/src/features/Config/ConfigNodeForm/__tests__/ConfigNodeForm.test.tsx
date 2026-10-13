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
      "type": "vmess",
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

const VMESS: JSONPath = ['outbounds', 1];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The node is read from the store as on the screen: the form sees every text edit. */
function NodeFromStore({ registry, path }: { registry: NodeRegistry; path: JSONPath }) {
  const text = useConfigText();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? <ConfigNodeForm registry={registry} path={path} node={node} /> : null;
}

function renderVmess() {
  return render(<NodeFromStore registry={NODE_REGISTRY.Outbound} path={VMESS} />);
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

/** Lines by which the draft differs from the source text. */
function changedLines(before: string, after: string): string[] {
  const lines = before.split('\n');

  return after.split('\n').filter((line, index) => line !== lines[index]);
}

/** Unset node fields are collapsed under "More parameters". */
async function showEmptyFields() {
  await userEvent.click(screen.getByRole('button', { name: /^Ещё параметры/ }));
}

function save() {
  return screen.getByRole('button', { name: 'Сохранить в черновик' });
}

describe('node form by schema', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('draws a field by its kind and does not draw the node type', async () => {
    renderVmess();

    expect(screen.getByRole('textbox', { name: 'server' })).toHaveValue('a.example');
    expect(screen.getByRole('spinbutton', { name: 'server_port' })).toHaveValue(443);
    expect(screen.queryByRole('switch', { name: 'tcp_fast_open' })).not.toBeInTheDocument();

    await showEmptyFields();

    expect(screen.getByRole('switch', { name: 'tcp_fast_open' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'domain_strategy' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'connect_timeout' })).toHaveAttribute('placeholder', '10s, 1m30s');
    expect(screen.queryByRole('textbox', { name: 'type' })).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('a field edit lands as one line: a comment inside the node is intact', async () => {
    const user = userEvent.setup();

    renderVmess();

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

  it('a cleared field is removed from the node, not written empty', async () => {
    const user = userEvent.setup();

    renderVmess();

    await user.clear(screen.getByRole('spinbutton', { name: 'server_port' }));
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), VMESS)).not.toHaveProperty('server_port');
    });
  });

  it('a flag resets to unset: the key leaves the file', async () => {
    const user = userEvent.setup();

    renderVmess();

    // The tls group is set in the node and open at once.
    await user.click(screen.getByRole('button', { name: 'Сбросить enabled' }));
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'tls'])).toEqual({ server_name: 'a.example', alpn: 'h2' });
    });
  });

  it('a one-string listable stays a string, with two becomes a list', async () => {
    const user = userEvent.setup();

    renderVmess();

    const alpn = screen.getByRole('textbox', { name: 'alpn' });

    expect(alpn).toHaveValue('h2');

    await user.clear(alpn);
    await user.type(alpn, 'http/1.1');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'tls', 'alpn'])).toBe('http/1.1');
    });

    await user.type(alpn, '{Enter}h2');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'tls', 'alpn'])).toEqual(['http/1.1', 'h2']);
    });
  });

  it('a value set is written in schema order', async () => {
    const user = userEvent.setup();

    renderVmess();

    await user.click(screen.getByRole('button', { name: 'udp' }));
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'network'])).toEqual(['tcp', 'udp']);
    });
  });

  it('an enum value is chosen from the schema, the empty item clears the key', async () => {
    const user = userEvent.setup();

    renderVmess();
    await showEmptyFields();

    await selectOption(user, screen.getByRole('combobox', { name: 'domain_strategy' }), 'prefer_ipv4');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'domain_strategy'])).toBe('prefer_ipv4');
    });

    await selectOption(user, screen.getByRole('combobox', { name: 'domain_strategy' }), 'не задано');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), VMESS)).not.toHaveProperty('domain_strategy');
    });
  });

  it('a group without values is collapsed, with values it is open', async () => {
    const user = userEvent.setup();

    renderVmess();
    await showEmptyFields();

    expect(screen.getByRole('button', { name: 'Поля tls' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'server_name' })).toHaveValue('a.example');

    const multiplex = screen.getByRole('button', { name: 'Поля multiplex' });

    expect(multiplex).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('switch', { name: 'padding' })).not.toBeInTheDocument();

    await user.click(multiplex);

    expect(screen.getByRole('switch', { name: 'padding' })).toBeInTheDocument();
  });

  it('names a duration in the wrong format and does not write it', async () => {
    const user = userEvent.setup();

    renderVmess();
    await showEmptyFields();

    await user.type(screen.getByRole('textbox', { name: 'connect_timeout' }), '10 секунд');

    expect(await screen.findByRole('alert')).toHaveTextContent('Длительность в формате 10s, 1m30s, 500ms');

    await user.click(save());

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('a "string or number" field writes digits as a number', async () => {
    const user = userEvent.setup();

    renderVmess();
    await showEmptyFields();

    await user.type(screen.getByRole('textbox', { name: 'routing_mark' }), '255');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'routing_mark'])).toBe(255);
    });
  });

  it('an unknown kind is edited as JSON text, unparsed text stops the write', async () => {
    const user = userEvent.setup();

    renderVmess();
    await showEmptyFields();

    const resolver = screen.getByRole('textbox', { name: 'domain_resolver' });

    await user.click(resolver);
    await user.paste('{ "server": ');

    expect(screen.getByRole('alert')).toHaveTextContent('JSON не разобран');

    await user.click(save());

    expect(ConfigDocumentState.getState().draft).toBeNull();

    await user.paste('"local" }');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'domain_resolver'])).toEqual({ server: 'local' });
    });
  });

  it('unparsed text rewritten by a node edit from outside does not hold the write', async () => {
    const user = userEvent.setup();

    renderVmess();
    await showEmptyFields();

    const resolver = screen.getByRole('textbox', { name: 'domain_resolver' });

    await user.click(resolver);
    await user.paste('{ "server": ');

    ConfigDocumentState.getState().edit([...VMESS, 'domain_resolver'], 'local');

    // A set field leaves the collapse for the set ones: the element is mounted again.
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'domain_resolver' })).toHaveValue('"local"');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const server = screen.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'b.example');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'server'])).toBe('b.example');
    });
    expect(findValue(draft(), [...VMESS, 'domain_resolver'])).toBe('local');
  });

  it('an edit of the same node by text reaches the form, what was typed is not erased', async () => {
    const user = userEvent.setup();

    renderVmess();

    const server = screen.getByRole('textbox', { name: 'server' });

    await user.clear(server);
    await user.type(server, 'typed.example');

    ConfigDocumentState.getState().edit([...VMESS, 'uuid'], 'REDACTED');

    expect(await screen.findByDisplayValue('REDACTED')).toBeInTheDocument();
    expect(server).toHaveValue('typed.example');
  });
});

/**
 * Golden on the corpus: a node of a real kind is edited by the form, and the file changes
 * by exactly one line: the other bytes, comments and key order are intact.
 */
const CORPUS = import.meta.glob<string>('/src/entities/Config/__tests__/corpus/*.json*', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * The most expanded recognized outbound of the file with a tag: its form is edited,
 * it has the most neighboring lines, which the edit must not touch.
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

/** Comment lines of the file: an edit by the form has no right to touch them. */
function commentLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => /^\s*(?:\/\/|\/\*)/.test(line));
}

describe('node form on the config corpus', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('the corpus has nodes to edit', () => {
    expect(GOLDEN.length).toBeGreaterThan(0);
  });

  it.each(GOLDEN)('$name: a tag edit by the form changes one line of the file', async ({ text, index }) => {
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
