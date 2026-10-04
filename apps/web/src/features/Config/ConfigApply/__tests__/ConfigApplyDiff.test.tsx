import { renderWithQuery } from '@test/renderWithQuery';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ConfigDocumentState } from '@entities/Config';

import { ConfigApplyDiff } from '../ui/ConfigApplyDiff';

const JSON_INDENT = 2;

function toText(rules: unknown[]): string {
  return JSON.stringify({ route: { rules } }, null, JSON_INDENT);
}

async function openDiff(applied: unknown[], draft: unknown[]) {
  ConfigDocumentState.getState().load(toText(applied));
  ConfigDocumentState.getState().replace(toText(draft));
  renderWithQuery(<ConfigApplyDiff canApply onApply={() => undefined} />);

  await userEvent.click(screen.getByRole('button', { name: 'Посмотреть диф' }));
}

const RULES = Array.from({ length: 8 }, (_, index) => ({
  domain_suffix: `site-${String(index)}.example`,
  outbound: 'proxy',
}));

describe('ConfigApplyDiff', () => {
  beforeEach(() => {
    ConfigDocumentState.getState().reset();
  });

  it('над дифом сводит правки правил словами, с нумерацией как в списке правил', async () => {
    const draft = RULES.slice(0, 7).map((rule, index) => (index === 1 ? { ...rule, outbound: 'direct' } : rule));

    await openDiff(RULES.slice(0, 7), [
      ...draft.filter((_, index) => index !== 4),
      { ip_is_private: true, outbound: 'direct' },
    ]);

    const summary = await screen.findByRole('list', { name: 'Изменения правил маршрутизации' });

    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Правило 2: proxy → direct', 'Правило 5 удалено', 'Правило 7 добавлено']);
  });

  it('переставленное правило называет перемещением, а не удалением и добавлением', async () => {
    const [first, second, ...rest] = RULES;

    await openDiff(RULES, [second, first, ...rest]);

    const summary = await screen.findByRole('list', { name: 'Изменения правил маршрутизации' });

    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Правило 1 перемещено на место 2']);
  });

  it('длинную сводку обрезает и говорит, сколько осталось', async () => {
    await openDiff([], RULES);

    const summary = await screen.findByRole('list', { name: 'Изменения правил маршрутизации' });
    const items = within(summary).getAllByRole('listitem');

    expect(items).toHaveLength(6);
    expect(items.at(-1)).toHaveTextContent('И ещё 3 изменения');
  });

  it('без правок правил сводку не показывает', async () => {
    ConfigDocumentState.getState().load('{\n  "log": { "level": "info" }\n}');
    ConfigDocumentState.getState().replace('{\n  "log": { "level": "debug" }\n}');
    renderWithQuery(<ConfigApplyDiff canApply onApply={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Посмотреть диф' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Изменения правил маршрутизации' })).not.toBeInTheDocument();
  });

  it('добавленную строку красит тоном успеха, удалённую — тоном опасности, и знак оставляет', async () => {
    ConfigDocumentState.getState().load('{\n  "log": { "level": "info" }\n}');
    ConfigDocumentState.getState().replace('{\n  "log": { "level": "debug" }\n}');
    renderWithQuery(<ConfigApplyDiff canApply onApply={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Посмотреть диф' }));

    const added = await screen.findByRole('row', { name: /"debug"/ });
    const removed = screen.getByRole('row', { name: /"info"/ });

    expect(added).toHaveClass('text-signal-ok');
    expect(added).toHaveTextContent('+ "log": { "level": "debug" }');
    expect(removed).toHaveClass('text-destructive');
    expect(removed).toHaveTextContent('− "log": { "level": "info" }');
  });
});
