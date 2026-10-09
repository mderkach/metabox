import { selectOption } from '@test/selectOption';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigDocumentState,
  CONFIG_SECTION,
  findValue,
  readSectionSettings,
  useConfigText,
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
  "route": {
    "rules": [{ "domain_suffix": ["example.com"], "outbound": "direct" }],
    "rule_set": [{ "type": "remote", "tag": "ads", "url": "https://example.com/ads.srs" }],
    "final": "direct",
    "auto_detect_interface": true,
    "default_mark": 255,
  },
}`;

function SettingsFromStore({ section }: { section: SettingsSection }) {
  const text = useConfigText();
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

function save() {
  return screen.getByRole('button', { name: 'Сохранить в черновик' });
}

describe('форма скаляров секции', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('показывает скаляры route и не показывает его списки', () => {
    render(<SettingsFromStore section={CONFIG_SECTION.Route} />);

    expect(screen.getByRole('textbox', { name: 'final' })).toHaveValue('direct');
    expect(screen.getByRole('switch', { name: 'auto_detect_interface' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'default_mark' })).toHaveValue('255');
    expect(screen.queryByText('rules')).not.toBeInTheDocument();
    expect(screen.queryByText('rule_set')).not.toBeInTheDocument();
  });

  it('правка route.final меняет одну строку и не трогает правила и сеты', async () => {
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Route} />);
    await user.clear(screen.getByRole('textbox', { name: 'final' }));
    await user.type(screen.getByRole('textbox', { name: 'final' }), 'proxy');
    await user.click(save());

    expect(changedLines(TEXT, draft())).toEqual(['    "final": "proxy",']);
    expect(findValue(draft(), ['route', 'rules', 0, 'outbound'])).toBe('direct');
    expect(findValue(draft(), ['route', 'rule_set', 0, 'tag'])).toBe('ads');
  });

  it('правка dns.strategy меняет одну строку и сохраняет комментарий и серверы', async () => {
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);
    await selectOption(user, screen.getByRole('combobox', { name: 'strategy' }), 'ipv4_only');
    await user.click(save());

    expect(changedLines(TEXT, draft())).toEqual(['    "strategy": "ipv4_only",']);
    expect(draft()).toContain('// стратегия для всех серверов');
    expect(findValue(draft(), ['dns', 'servers', 0, 'tag'])).toBe('local');
  });

  it('создаёт секцию dns, если её в файле нет', async () => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load('{\n  "route": {}\n}');
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);
    await user.click(screen.getByRole('button', { name: /^Ещё параметры/ }));
    await user.type(screen.getByRole('textbox', { name: 'final' }), 'local');
    await user.click(save());

    await waitFor(() => {
      expect(findValue(draft(), ['dns', 'final'])).toBe('local');
    });
    expect(findValue(draft(), ['route'])).toEqual({});
  });
});
