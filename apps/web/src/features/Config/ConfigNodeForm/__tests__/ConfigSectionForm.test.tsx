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
  "route": {
    "rules": [{ "domain_suffix": ["example.com"], "outbound": "direct" }],
    "rule_set": [{ "type": "remote", "tag": "ads", "url": "https://example.com/ads.srs" }],
    "final": "direct",
    "auto_detect_interface": true,
    "default_mark": 255,
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

describe('section scalars form', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('shows route scalars and does not show its lists', () => {
    render(<SettingsFromStore section={CONFIG_SECTION.Route} />);

    expect(screen.getByRole('textbox', { name: 'final' })).toHaveValue('direct');
    expect(screen.getByRole('switch', { name: 'auto_detect_interface' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'default_mark' })).toHaveValue('255');
    expect(screen.queryByText('rules')).not.toBeInTheDocument();
    expect(screen.queryByText('rule_set')).not.toBeInTheDocument();
  });

  it('a route.final edit changes one line and does not touch rules and rule sets', async () => {
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Route} />);
    await user.clear(screen.getByRole('textbox', { name: 'final' }));
    await user.type(screen.getByRole('textbox', { name: 'final' }), 'proxy');

    expect(changedLines(TEXT, draft())).toEqual(['    "final": "proxy",']);
    expect(findValue(draft(), ['route', 'rules', 0, 'outbound'])).toBe('direct');
    expect(findValue(draft(), ['route', 'rule_set', 0, 'tag'])).toBe('ads');
  });

  it('a dns.strategy edit changes one line and keeps the comment and servers', async () => {
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);
    await selectOption(user, screen.getByRole('combobox', { name: 'strategy' }), 'ipv4_only');

    expect(changedLines(TEXT, draft())).toEqual(['    "strategy": "ipv4_only",']);
    expect(draft()).toContain('// стратегия для всех серверов');
    expect(findValue(draft(), ['dns', 'servers', 0, 'tag'])).toBe('local');
  });

  it('creates the dns section if it is not in the file', async () => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load('{\n  "route": {}\n}');
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);
    await user.click(screen.getByRole('button', { name: /^Ещё параметры/ }));
    await user.type(screen.getByRole('textbox', { name: 'final' }), 'local');

    await waitFor(() => {
      expect(findValue(draft(), ['dns', 'final'])).toBe('local');
    });
    expect(findValue(draft(), ['route'])).toEqual({});
  });
});

describe('dns.optimistic, a flag or an object', () => {
  const FLAG = `{
  "dns": {
    "servers": [{ "type": "local", "tag": "local" }],
    // отдавать устаревший ответ, пока идёт новый запрос
    "optimistic": true,
    "final": "local",
  },
}`;

  const OBJECT = `{
  "dns": {
    "optimistic": {
      // кэш дольше часа не отдаём
      "enabled": true,
      "timeout": "1h",
    },
    "final": "local",
  },
}`;

  function load(text: string) {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(text);
  }

  it('edits without JSON: a detail turns the flag into the object in place', async () => {
    load(FLAG);
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);

    expect(screen.getByRole('switch', { name: 'optimistic' })).toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'optimistic' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Подробнее: optimistic' }));

    expect(findValue(draft() || FLAG, ['dns', 'optimistic'])).toBe(true);

    await user.type(screen.getByRole('textbox', { name: 'timeout' }), '1h');
    await user.tab();

    await waitFor(() => {
      expect(findValue(draft(), ['dns', 'optimistic'])).toEqual({ enabled: true, timeout: '1h' });
    });
    expect(draft()).toContain('// отдавать устаревший ответ, пока идёт новый запрос');
    expect(findValue(draft(), ['dns', 'final'])).toBe('local');
  });

  it('switching off over the open details writes the flag, not an object', async () => {
    load(FLAG);
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);
    await user.click(screen.getByRole('button', { name: 'Подробнее: optimistic' }));
    await user.click(screen.getByRole('switch', { name: 'optimistic' }));

    await waitFor(() => {
      expect(changedLines(FLAG, draft())).toEqual(['    "optimistic": false,']);
    });
  });

  it('an object in the file opens with its details and is edited by keys, keeping its comment', async () => {
    load(OBJECT);
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);

    expect(screen.getByRole('textbox', { name: 'timeout' })).toHaveValue('1h');

    await user.click(screen.getByRole('switch', { name: 'optimistic' }));

    await waitFor(() => {
      expect(changedLines(OBJECT, draft())).toEqual(['      "enabled": false,']);
    });

    await user.clear(screen.getByRole('textbox', { name: 'timeout' }));
    await user.tab();

    await waitFor(() => {
      expect(findValue(draft(), ['dns', 'optimistic'])).toEqual({ enabled: false });
    });
    expect(draft()).toContain('// кэш дольше часа не отдаём');
  });

  it('a reset removes the key whatever its form', async () => {
    load(OBJECT);
    const user = userEvent.setup();

    render(<SettingsFromStore section={CONFIG_SECTION.Dns} />);
    await user.click(screen.getByRole('button', { name: 'Сбросить optimistic' }));
    await user.tab();

    await waitFor(() => {
      expect(findValue(draft(), ['dns'])).toEqual({ final: 'local' });
    });
  });
});
