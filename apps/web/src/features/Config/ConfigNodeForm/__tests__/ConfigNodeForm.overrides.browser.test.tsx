import { renderWithQuery } from '@test/renderWithQuery';
import { render, screen, waitFor } from '@testing-library/react';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  ConfigDocumentState,
  findValue,
  NODE_REGISTRY,
  RULES_PATH,
  useConfigCurrent,
  type NodeRegistry,
} from '@entities/Config';
import { ConfigNodeAddForm } from '@features/Config/ConfigNodeAdd';
import { ConfigSchema } from '@shared/api/generated';
import { parseJsonc } from '@shared/lib/jsonc';

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
  const text = useConfigCurrent();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? <ConfigNodeForm registry={registry} path={path} node={node} builtTags={builtTags} /> : null;
}

/** Opens a dropdown and picks an option with the mouse. */
async function pick(trigger: HTMLElement, name: string | RegExp): Promise<void> {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('VLESS/Reality form override picked with the mouse', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('flow and the uTLS fingerprint are chosen from the fork values', async () => {
    render(<NodeFromStore path={VLESS} />);

    await pick(screen.getByRole('combobox', { name: 'Режим XTLS' }), 'xtls-rprx-vision');
    await pick(screen.getByRole('combobox', { name: 'Отпечаток браузера' }), 'firefox');

    await waitFor(() => {
      expect(findValue(draft(), [...VLESS, 'flow'])).toBe('xtls-rprx-vision');
    });
    expect(findValue(draft(), [...VLESS, 'tls', 'utls', 'fingerprint'])).toBe('firefox');
  });
});

/**
 * A config built from scratch, at the schema level: in an empty document, forms assemble a VLESS
 * with Reality and a rule for it, and the schema accepts the whole config document.
 * `sing-box check` does not run here: that is a test bench check.
 */
describe('VLESS/Reality from scratch', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load('{}');
  });

  it('a node from the add form and the node form with a rule passes the config schema', async () => {
    const add = renderWithQuery(<ConfigNodeAddForm section='outbounds' takenTags={[]} builtTags={['with_utls']} />);

    await pick(screen.getByRole('combobox', { name: 'Тип' }), /^vless/);
    await userEvent.type(screen.getByRole('textbox', { name: 'Тег' }), 'vless-out');
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => {
      expect(findValue(draft(), ['outbounds', 0, 'tag'])).toBe('vless-out');
    });

    add.unmount();
    render(<NodeFromStore path={VLESS} builtTags={['with_utls']} />);

    await userEvent.fill(screen.getByRole('textbox', { name: 'Сервер' }), 'a.example');
    await userEvent.fill(screen.getByRole('spinbutton', { name: 'Порт сервера' }), '443');
    await userEvent.fill(screen.getByLabelText(/^UUID пользователя/), UUID);
    await userEvent.fill(screen.getByRole('textbox', { name: 'Имя сервера (SNI)' }), 'www.example');
    await userEvent.fill(screen.getByRole('textbox', { name: 'Публичный ключ Reality' }), PUBLIC_KEY);
    await userEvent.fill(screen.getByRole('textbox', { name: 'Short ID Reality' }), '0123456789abcdef');

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
