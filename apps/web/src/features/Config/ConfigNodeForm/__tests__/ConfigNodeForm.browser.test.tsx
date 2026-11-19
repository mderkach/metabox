import { render, screen, waitFor } from '@testing-library/react';
import type { JSONPath } from 'jsonc-parser';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { ConfigDocumentState, findValue, NODE_REGISTRY, useConfigCurrent, type NodeRegistry } from '@entities/Config';

import { ConfigNodeForm } from '../ui/ConfigNodeForm';

const TEXT = `{
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    {
      "type": "vmess",
      "tag": "hk-01",
      "server": "a.example",
      "server_port": 443,
    },
  ],
}`;

const VMESS: JSONPath = ['outbounds', 1];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The node is read from the store as on the screen: the form sees every text edit. */
function NodeFromStore({ registry, path }: { registry: NodeRegistry; path: JSONPath }) {
  const text = useConfigCurrent();
  const node = useMemo(() => (text === null ? undefined : findValue(text, path)), [text, path]);

  return isRecord(node) ? <ConfigNodeForm registry={registry} path={path} node={node} /> : null;
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

/** Opens a dropdown and picks an option with the mouse. */
async function pick(trigger: HTMLElement, name: string): Promise<void> {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('node form picked with the mouse', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('an enum value is chosen from the schema, the empty item clears the key', async () => {
    render(<NodeFromStore registry={NODE_REGISTRY.Outbound} path={VMESS} />);
    await userEvent.click(screen.getByRole('button', { name: /^Ещё параметры/ }));

    await pick(screen.getByRole('combobox', { name: 'domain_strategy' }), 'prefer_ipv4');

    await waitFor(() => {
      expect(findValue(draft(), [...VMESS, 'domain_strategy'])).toBe('prefer_ipv4');
    });

    await pick(screen.getByRole('combobox', { name: 'domain_strategy' }), 'не задано');

    await waitFor(() => {
      expect(findValue(draft(), VMESS)).not.toHaveProperty('domain_strategy');
    });
  });
});
