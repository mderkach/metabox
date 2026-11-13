import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState, findValue, readRuleSets, useConfigCurrent } from '@entities/Config';

import { RuleSetEditForm } from '../ui/RuleSetEditForm';

const URL_WITH_TOKEN = 'https://lists.example.com/private/ads.srs?token=s3cret';

const TEXT = `{
  "route": {
    "rule_set": [
      { "type": "local", "tag": "own", "path": "rule-sets/own.json" },
      {
        "type": "remote",
        // реклама
        "tag": "ads",
        "url": "${URL_WITH_TOKEN}",
        "update_interval": "1d",
        "http_client": "default"
      }
    ]
  }
}`;

const INDEX = 1;

function node(): Record<string, unknown> {
  const value: unknown = readRuleSets(TEXT)[INDEX];

  if (typeof value !== 'object' || value === null) {
    throw new Error('[TEST] в фикстуре нет сета');
  }

  return { ...value };
}

function draft(): string {
  return ConfigDocumentState.getState().draft ?? '';
}

function changedLines(before: string, after: string): string[] {
  const lines = before.split('\n');

  return after.split('\n').filter((line, index) => line !== lines[index]);
}

function renderForm(onDone = vi.fn<() => void>()) {
  render(
    <RuleSetEditForm index={INDEX} node={node()} takenTags={['own', 'ads']} outbounds={['direct']} onDone={onDone} />
  );

  return onDone;
}

describe('rule set edit form', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('hides the address after the host and reveals it with a button', async () => {
    const user = userEvent.setup();

    renderForm();

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue('https://lists.example.com/••••••');

    await user.click(screen.getByRole('button', { name: 'Показать url' }));

    expect(url).toHaveValue(URL_WITH_TOKEN);
  });

  it('shows a public address without userinfo or query in full, editable at once', () => {
    const open = 'https://lists.example.com/rules/ads.srs';

    render(
      <RuleSetEditForm
        index={INDEX}
        node={{ type: 'remote', tag: 'ads', url: open }}
        takenTags={['own', 'ads']}
        outbounds={['direct']}
        onDone={vi.fn<() => void>()}
      />
    );

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue(open);
    expect(url).not.toHaveAttribute('readonly');
  });

  it('a tag edit goes into the draft as typed: one line changes, the full address and foreign fields remain', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.clear(screen.getByLabelText('Имя сета'));
    await user.type(screen.getByLabelText('Имя сета'), 'ads-new');

    await waitFor(() => {
      expect(changedLines(TEXT, draft())).toEqual(['        "tag": "ads-new",']);
    });
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'url'])).toBe(URL_WITH_TOKEN);
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'http_client'])).toBe('default');
    expect(draft()).toContain('// реклама');
  });

  it('writes the new address in full', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByRole('button', { name: 'Показать url' }));
    await user.clear(screen.getByRole('textbox', { name: 'url' }));
    await user.type(screen.getByRole('textbox', { name: 'url' }), 'https://cdn.example.com/a/ads.srs?key=k');

    await waitFor(() => {
      expect(findValue(draft(), ['route', 'rule_set', INDEX, 'url'])).toBe('https://cdn.example.com/a/ads.srs?key=k');
    });
  });

  it('does not write a tag taken by another rule set and says why', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.clear(screen.getByLabelText('Имя сета'));
    await user.type(screen.getByLabelText('Имя сета'), 'own');

    expect(await screen.findByText('такое имя уже занято другим сетом')).toBeInTheDocument();
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'tag'])).not.toBe('own');
  });

  it('a cleared address is not saved, not even on leaving the field', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByRole('button', { name: 'Показать url' }));
    await user.clear(screen.getByRole('textbox', { name: 'url' }));
    await user.tab();

    expect(ConfigDocumentState.getState().draft).toBeNull();
  });

  it('drops an explicit format the new address contradicts once focus leaves the form', async () => {
    const user = userEvent.setup();
    const own = 'https://lists.example.com/ads';

    ConfigDocumentState.getState().load(
      `{"route":{"rule_set":[{"type":"local","tag":"own","path":"p"},{"type":"remote","tag":"ads","format":"binary","url":"${own}"}]}}`
    );
    render(
      <RuleSetEditForm
        index={INDEX}
        node={{ type: 'remote', tag: 'ads', format: 'binary', url: own }}
        takenTags={['own', 'ads']}
        outbounds={['direct']}
        onDone={vi.fn<() => void>()}
      />
    );

    const url = screen.getByRole('textbox', { name: 'url' });

    await user.clear(url);
    await user.type(url, 'https://lists.example.com/ads.json');
    await user.click(document.body);

    await waitFor(() => {
      expect(findValue(draft(), ['route', 'rule_set', INDEX, 'url'])).toBe('https://lists.example.com/ads.json');
    });
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'format'])).toBeUndefined();
  });

  it('keeps an explicit format the address agrees with', async () => {
    const user = userEvent.setup();
    const own = 'https://lists.example.com/ads.srs';

    ConfigDocumentState.getState().load(
      `{"route":{"rule_set":[{"type":"local","tag":"own","path":"p"},{"type":"remote","tag":"ads","format":"binary","url":"${own}"}]}}`
    );
    render(
      <RuleSetEditForm
        index={INDEX}
        node={{ type: 'remote', tag: 'ads', format: 'binary', url: own }}
        takenTags={['own', 'ads']}
        outbounds={['direct']}
        onDone={vi.fn<() => void>()}
      />
    );

    await user.type(screen.getByLabelText('Имя сета'), '-2');
    await user.click(document.body);

    await waitFor(() => {
      expect(findValue(draft(), ['route', 'rule_set', INDEX, 'tag'])).toBe('ads-2');
    });
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'format'])).toBe('binary');
  });

  it('"Done" closes the form', async () => {
    const user = userEvent.setup();
    const onDone = renderForm();

    await user.click(screen.getByRole('button', { name: 'Готово' }));

    expect(onDone).toHaveBeenCalledOnce();
  });
});

function LiveRuleSetForm() {
  const text = useConfigCurrent();
  const current: unknown = readRuleSets(text ?? '')[INDEX];

  if (typeof current !== 'object' || current === null) throw new Error('Missing rule set');

  return (
    <RuleSetEditForm
      index={INDEX}
      node={{ ...current }}
      takenTags={['own', 'ads']}
      outbounds={['direct']}
      onDone={() => {}}
    />
  );
}

describe('rule set form document synchronization', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('discards form values with the draft and does not restore them on the next edit', async () => {
    const user = userEvent.setup();

    render(<LiveRuleSetForm />);
    await user.clear(screen.getByLabelText('Имя сета'));
    await user.type(screen.getByLabelText('Имя сета'), 'ads-new');
    await waitFor(() => {
      expect(findValue(draft(), ['route', 'rule_set', INDEX, 'tag'])).toBe('ads-new');
    });

    act(() => {
      ConfigDocumentState.getState().discard();
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Имя сета')).toHaveValue('ads');
    });
    await user.click(screen.getByRole('button', { name: 'Ещё настройки' }));
    await user.clear(screen.getByLabelText('Как часто обновлять'));
    await user.type(screen.getByLabelText('Как часто обновлять'), '2d');
    await waitFor(() => {
      expect(findValue(draft(), ['route', 'rule_set', INDEX, 'update_interval'])).toBe('2d');
    });
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'tag'])).toBe('ads');
  });

  it('pulls a replacement device node into the mounted form', async () => {
    render(<LiveRuleSetForm />);

    act(() => {
      ConfigDocumentState.getState().load(TEXT.replace('"tag": "ads"', '"tag": "fresh"'));
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Имя сета')).toHaveValue('fresh');
    });
    expect(ConfigDocumentState.getState().draft).toBeNull();
  });
});
