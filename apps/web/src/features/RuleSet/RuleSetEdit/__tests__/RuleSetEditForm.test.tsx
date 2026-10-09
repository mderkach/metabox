import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigDocumentState, findValue, readRuleSets } from '@entities/Config';

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

describe('форма правки сета', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
    ConfigDocumentState.getState().load(TEXT);
  });

  it('прячет адрес после хоста и раскрывает его кнопкой', async () => {
    const user = userEvent.setup();

    renderForm();

    const url = screen.getByRole('textbox', { name: 'url' });

    expect(url).toHaveValue('https://lists.example.com/••••••');

    await user.click(screen.getByRole('button', { name: 'Показать url' }));

    expect(url).toHaveValue(URL_WITH_TOKEN);
  });

  it('правка тега меняет одну строку, полный адрес и чужие поля остаются', async () => {
    const user = userEvent.setup();
    const onDone = renderForm();

    await user.clear(screen.getByLabelText('Имя сета'));
    await user.type(screen.getByLabelText('Имя сета'), 'ads-new');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(changedLines(TEXT, draft())).toEqual(['        "tag": "ads-new",']);
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'url'])).toBe(URL_WITH_TOKEN);
    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'http_client'])).toBe('default');
    expect(draft()).toContain('// реклама');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('пишет новый адрес целиком', async () => {
    const user = userEvent.setup();

    renderForm();

    await user.click(screen.getByRole('button', { name: 'Показать url' }));
    await user.clear(screen.getByRole('textbox', { name: 'url' }));
    await user.type(screen.getByRole('textbox', { name: 'url' }), 'https://cdn.example.com/a/ads.srs?key=k');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(findValue(draft(), ['route', 'rule_set', INDEX, 'url'])).toBe('https://cdn.example.com/a/ads.srs?key=k');
  });

  it('не даёт занять тег другого сета и не пишет черновик', async () => {
    const user = userEvent.setup();
    const onDone = renderForm();

    await user.clear(screen.getByLabelText('Имя сета'));
    await user.type(screen.getByLabelText('Имя сета'), 'own');
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(await screen.findByText('такое имя уже занято другим сетом')).toBeInTheDocument();
    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('очищенный адрес не сохраняется', async () => {
    const user = userEvent.setup();
    const onDone = renderForm();

    await user.click(screen.getByRole('button', { name: 'Показать url' }));
    await user.clear(screen.getByRole('textbox', { name: 'url' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить в черновик' }));

    expect(ConfigDocumentState.getState().draft).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});
