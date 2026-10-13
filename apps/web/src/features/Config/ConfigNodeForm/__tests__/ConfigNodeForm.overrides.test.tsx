import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigDocumentState,
  findValue,
  newSectionNode,
  NODE_REGISTRY,
  RULES_PATH,
  useConfigDiff,
  useConfigText,
  type NodeRegistry,
} from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigSchema } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';

import { NODE_OVERRIDE_ERROR, nodeOverrideOf, nodePreset, overrideIssues } from '../model';
import { ConfigNodeForm } from '../ui/ConfigNodeForm';

/** A Reality key in the fork client format: base64url without padding, 32 bytes. Not a real one. */
const PUBLIC_KEY = 'jNXHt1yRo0vDuchQlIP6Z0ZvjT3KtzVI-T4E7RoLJS0';

const UUID = '6f1c1b2e-3d4a-4b5c-8d6e-7f8091a2b3c4';

const TEXT = `{
  // выходы
  "outbounds": [
    {
      "type": "vless",
      "tag": "hk-01",
      "server": "a.example",
      "server_port": 443,
      "uuid": "REDACTED",
      "tls": {
        "enabled": true,
        "server_name": "a.example",
        "utls": { "enabled": true, "fingerprint": "chrome" },
        "reality": { "enabled": true, "public_key": "REDACTED", "short_id": "REDACTED" },
      },
    },
  ],
}`;

const VLESS: JSONPath = ['outbounds', 0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

function save() {
  return screen.getByRole('button', { name: 'Сохранить в черновик' });
}

/** The node is read from the store as on the screen: the form sees every text edit. */
function NodeFromStore({
  path,
  registry = NODE_REGISTRY.Outbound,
  builtTags = null,
}: {
  path: JSONPath;
  registry?: NodeRegistry;
  builtTags?: readonly string[] | null;
}) {
  const text = useConfigText();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? <ConfigNodeForm registry={registry} path={path} node={node} builtTags={builtTags} /> : null;
}

/** Whether the elements go in the document in the order they are listed. */
function inDocumentOrder(elements: readonly HTMLElement[]): boolean {
  return elements.every(
    (element, index) =>
      index === 0 || Boolean(elements[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
  );
}

describe('VLESS/Reality form override', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('opens with the main fields in order, the rest under a collapsed group', () => {
    render(<NodeFromStore path={VLESS} />);

    const primary = [
      screen.getByRole('textbox', { name: 'tag' }),
      screen.getByRole('textbox', { name: 'server' }),
      screen.getByRole('spinbutton', { name: 'server_port' }),
      screen.getByRole('textbox', { name: 'uuid' }),
      screen.getByRole('combobox', { name: 'flow' }),
      screen.getByRole('textbox', { name: 'tls.server_name' }),
      screen.getByRole('combobox', { name: 'tls.utls.fingerprint' }),
      screen.getByRole('textbox', { name: 'tls.reality.public_key' }),
      screen.getByRole('textbox', { name: 'tls.reality.short_id' }),
    ];

    expect(inDocumentOrder([...primary, screen.getByRole('button', { name: /^Ещё параметры/ })])).toBe(true);
    expect(screen.getByRole('button', { name: /^Ещё параметры/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'domain_strategy' })).not.toBeInTheDocument();
  });

  it('the collapsed group opens the remaining fields without repeating the main ones', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.click(screen.getByRole('button', { name: /^Ещё параметры/ }));

    expect(screen.getByRole('combobox', { name: 'domain_strategy' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: /server_name$/ })).toHaveLength(1);
  });

  it('flow and the uTLS fingerprint are chosen from the fork values', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'flow' }), 'xtls-rprx-vision');
    await selectOption(user, screen.getByRole('combobox', { name: 'tls.utls.fingerprint' }), 'firefox');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'flow'])).toBe('xtls-rprx-vision');
    });
    expect(findValue(draft(), [...VLESS, 'tls', 'utls', 'fingerprint'])).toBe('firefox');
  });

  it('an empty server is a required field, nothing is written', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.clear(screen.getByRole('textbox', { name: 'server' }));
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Обязательное поле');
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('a Reality key not in the fork client format is called an error, a valid one is written', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    const key = screen.getByRole('textbox', { name: 'tls.reality.public_key' });

    await user.clear(key);
    await user.type(key, 'not-a-key');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ключ Reality: base64url без паддинга, 32 байта (43 символа)'
    );

    await user.click(save());

    expect(ConfigDocumentState.getState().draft).toBeNull();

    await user.clear(key);
    await user.paste(PUBLIC_KEY);
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls', 'reality', 'public_key'])).toBe(PUBLIC_KEY);
    });
  });

  it('untouched keys do not prevent editing a neighboring field', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={VLESS} />);

    await user.type(screen.getByRole('textbox', { name: 'tag' }), '-edited');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tag'])).toBe('hk-01-edited');
    });
  });

  it('uTLS is marked when the binary is built without with_utls, and not marked with the build', () => {
    const { unmount } = render(<NodeFromStore path={VLESS} builtTags={['with_quic']} />);

    expect(screen.getAllByText('нет в сборке: with_utls')).not.toHaveLength(0);

    unmount();
    render(<NodeFromStore path={VLESS} builtTags={['with_utls']} />);

    expect(screen.queryByText(/нет в сборке/)).not.toBeInTheDocument();
  });
});

describe('VLESS override checks', () => {
  const override = nodeOverrideOf(NODE_REGISTRY.Outbound, 'vless');
  const reality = { type: 'vless', server: 'a.example', server_port: 443, uuid: UUID };

  it('the key and short_id are checked against the fork client format', () => {
    const node = {
      ...reality,
      tls: { server_name: 'a.example', reality: { enabled: true, public_key: 'abc', short_id: 'xyz' } },
    };

    expect(overrideIssues(override, node, {})).toEqual([
      { name: 'tls.reality.public_key', code: NODE_OVERRIDE_ERROR.RealityPublicKey },
      { name: 'tls.reality.short_id', code: NODE_OVERRIDE_ERROR.RealityShortId },
    ]);
  });

  it('short_id is hex of even length up to 8 bytes, empty is allowed', () => {
    const issues = (shortId: string) =>
      overrideIssues(
        override,
        {
          ...reality,
          tls: { server_name: 'a.example', reality: { enabled: true, public_key: PUBLIC_KEY, short_id: shortId } },
        },
        {}
      );

    expect(issues('0123456789abcdef')).toEqual([]);
    expect(issues('')).toEqual([]);
    expect(issues('abc')).toEqual([{ name: 'tls.reality.short_id', code: NODE_OVERRIDE_ERROR.RealityShortId }]);
    expect(issues('0123456789abcdef00')).toEqual([
      { name: 'tls.reality.short_id', code: NODE_OVERRIDE_ERROR.RealityShortId },
    ]);
  });

  it('the server name and key are required only with Reality', () => {
    expect(overrideIssues(override, { ...reality, tls: { reality: { enabled: true } } }, {})).toEqual([
      { name: 'tls.server_name', code: NODE_OVERRIDE_ERROR.Required },
      { name: 'tls.reality.public_key', code: NODE_OVERRIDE_ERROR.Required },
    ]);
    expect(overrideIssues(override, { ...reality, tls: { enabled: true } }, {})).toEqual([]);
  });
});

/**
 * The AC-6 scenario at the schema level: in an empty document, forms assemble a VLESS
 * with Reality and a rule for it, and the schema accepts the whole config document.
 * `sing-box check` does not run here: that is a test bench check.
 */
describe('VLESS/Reality from scratch', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load('{}');
  });

  it('a node from the add form and the node form with a rule passes the config schema', async () => {
    const user = userEvent.setup();
    const add = renderWithQuery(<ConfigNodeAddForm section='outbounds' takenTags={[]} builtTags={['with_utls']} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Тип' }), 'vless');
    await user.type(screen.getByRole('textbox', { name: 'Тег' }), 'vless-out');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 0, 'tag'])).toBe('vless-out');
    });

    add.unmount();
    render(<NodeFromStore path={VLESS} builtTags={['with_utls']} />);

    // Long values are pasted, not typed: per-character input with
    // a check on every character hits the test timeout under load.
    const fill = async (role: 'textbox' | 'spinbutton', name: string, value: string) => {
      await user.click(screen.getByRole(role, { name }));
      await user.paste(value);
    };

    await fill('textbox', 'server', 'a.example');
    await fill('spinbutton', 'server_port', '443');
    await fill('textbox', 'uuid', UUID);
    await fill('textbox', 'tls.server_name', 'www.example');
    await fill('textbox', 'tls.reality.public_key', PUBLIC_KEY);
    await fill('textbox', 'tls.reality.short_id', '0123456789abcdef');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'tls', 'reality', 'short_id'])).toBe('0123456789abcdef');
    });

    ConfigDocumentState.getState().insert([...RULES_PATH, 0], { outbound: 'vless-out' });

    const { value, failure } = parseJsonc(draft());

    expect(failure).toBeNull();
    expect(value).toEqual({
      outbounds: [
        {
          type: 'vless',
          tag: 'vless-out',
          tls: {
            enabled: true,
            utls: { enabled: true, fingerprint: 'chrome' },
            reality: { enabled: true, public_key: PUBLIC_KEY, short_id: '0123456789abcdef' },
            server_name: 'www.example',
          },
          server: 'a.example',
          server_port: 443,
          uuid: UUID,
        },
      ],
      route: { rules: [{ outbound: 'vless-out' }] },
    });
    expect(ConfigSchema.safeParse(value).success).toBe(true);
  });
});

describe('api service override', () => {
  const API: JSONPath = ['services', 0];

  it('a new service listens on loopback and gets a random secret, the port is not filled in', () => {
    const first = nodePreset(NODE_REGISTRY.Service, 'api', 'api', newSectionNode);
    const second = nodePreset(NODE_REGISTRY.Service, 'api', 'api', newSectionNode);

    expect({ ...first, secret: null }).toEqual({ type: 'api', tag: 'api', listen: '127.0.0.1', secret: null });
    const secret: unknown = Reflect.get(first, 'secret');

    expect(secret).toMatch(/^[\w-]{32}$/);
    expect(first).not.toEqual(second);
  });

  it('is not saved without a port, with a port it is written to the node', async () => {
    const user = userEvent.setup();

    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(
      JSON.stringify({ services: [nodePreset(NODE_REGISTRY.Service, 'api', 'api', newSectionNode)] }, null, 2)
    );
    render(<NodeFromStore path={API} registry={NODE_REGISTRY.Service} />);

    expect(screen.getByRole('textbox', { name: 'listen' })).toHaveValue('127.0.0.1');
    expect(screen.getByRole('button', { name: 'Поля tls' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'tag' }), '-grpc');
    await user.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('Обязательное поле');
    expect(ConfigDocumentState.getState().draft).toBeNull();

    await user.type(screen.getByRole('spinbutton', { name: 'listen_port' }), '9091');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...API, 'listen_port'])).toBe(9091);
    });
  });
});

describe('secret fields', () => {
  /** The subscription and password are made up. */
  const SECRET_TEXT = `{
  "outbounds": [
    { "type": "shadowsocks", "tag": "ss", "server": "a.example", "server_port": 8388, "password": "hunter2" },
  ],
  "providers": [
    { "type": "remote", "tag": "sub", "url": "https://sub.example/api/v1/client/subscribe?token=abc123" },
    { "type": "remote", "tag": "bare", "url": "https://bare.example" },
  ],
}`;

  const SHADOWSOCKS: JSONPath = ['outbounds', 0];

  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(SECRET_TEXT);
  });

  it('the password is hidden by a mask and revealed by a button, the draft is untouched', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={SHADOWSOCKS} />);

    const password = screen.getByLabelText('password');

    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('hunter2');

    await user.click(screen.getByRole('button', { name: 'Показать password' }));

    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Скрыть password' }));

    expect(password).toHaveAttribute('type', 'password');
    expect(save()).toBeDisabled();
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('a password typed under the mask goes into the draft and the diff in full', async () => {
    const user = userEvent.setup();

    render(<NodeFromStore path={SHADOWSOCKS} />);

    const password = screen.getByLabelText('password');

    await user.clear(password);
    await user.type(password, 'correct-horse');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), [...SHADOWSOCKS, 'password'])).toBe('correct-horse');
    });

    const { result } = renderHook(() => useConfigDiff());

    expect(result.current.map((line) => line.text).join('\n')).toContain('"password": "correct-horse"');
  });

  it('the subscription URL shows the host, the rest is revealed by a button and editable', async () => {
    const user = userEvent.setup();
    const full = 'https://sub.example/api/v1/client/subscribe?token=abc123';

    render(<NodeFromStore path={['providers', 0]} registry={NODE_REGISTRY.Provider} />);

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue('https://sub.example/••••••');
    expect(url).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: 'Показать url' }));

    expect(url).toHaveValue(full);
    expect(url).not.toHaveAttribute('readonly');

    await user.type(url, '2');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), ['providers', 0, 'url'])).toBe(`${full}2`);
    });

    const { result } = renderHook(() => useConfigDiff());

    expect(result.current.map((line) => line.text).join('\n')).toContain(`${full}2`);
  });

  it('a URL of only a host has nothing to hide: the field is editable at once', () => {
    render(<NodeFromStore path={['providers', 1]} registry={NODE_REGISTRY.Provider} />);

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue('https://bare.example');
    expect(url).not.toHaveAttribute('readonly');
  });

  it('uuid is not hidden: it is an identifier, not a password', () => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
    render(<NodeFromStore path={VLESS} />);

    expect(screen.getByRole('textbox', { name: 'uuid' })).toHaveValue('REDACTED');
  });
});
