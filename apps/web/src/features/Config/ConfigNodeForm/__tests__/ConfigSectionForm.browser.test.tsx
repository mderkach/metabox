import { render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  ConfigDocumentState,
  CONFIG_SECTION,
  findValue,
  readSectionSettings,
  useConfigCurrent,
  type SettingsSection,
} from '@entities/Config';

import { ConfigSectionForm } from '../ui/ConfigSectionForm';

const TEXT = `{
  "dns": {
    "servers": [{ "type": "local", "tag": "local" }],
    // стратегия для всех серверов
    "strategy": "prefer_ipv4",
    "final": "local",
  },
}`;

function SettingsFromStore({ section }: { section: SettingsSection }) {
  const text = useConfigCurrent();
  const settings = useMemo(() => (text === null ? null : readSectionSettings(text, section)), [text, section]);

  return settings === null ? null : <ConfigSectionForm section={section} settings={settings} />;
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

function changedLines(before: string, after: string): string[] {
  const lines = before.split('\n');

  return after.split('\n').filter((line, index) => line !== lines[index]);
}

describe('section scalars form picked with the mouse', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('a dns.strategy edit changes one line and keeps the comment and servers', async () => {
    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'strategy' }));
    await userEvent.click(await screen.findByRole('option', { name: 'ipv4_only' }));

    expect(changedLines(TEXT, draft())).toEqual(['    "strategy": "ipv4_only",']);
    expect(draft()).toContain('// стратегия для всех серверов');
    expect(findValue(draft(), ['dns', 'servers', 0, 'tag'])).toBe('local');
  });
});
