import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { mockVirtualSizes } from '@test/virtualSizes';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStore, type ConnectionRow } from '@entities/Connection';
import { makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';

import { useConnectionView } from '../lib';
import { ConnectionTable, type ConnectionTableEmpty } from '../ui';
import { CONNECTION_COLUMNS_HIDDEN, CONNECTION_FIELD, type ConnectionField } from '../ui/ConnectionColumns';

const STORAGE_KEY = 'metabox.connections.view';

/** Rows are built by the real snapshot parse: the filter works by its fields. */
function makeRows(count: number): ConnectionRow[] {
  ConnectionStore.getState().reset();
  ConnectionStore.getState().apply(makeConnectionsSnapshot(count));

  return ConnectionStore.getState().active;
}

function renderEmpty({ filtered, reset }: ConnectionTableEmpty) {
  return (
    <button type='button' onClick={reset}>
      {filtered ? 'Сбросить отбор' : 'Соединений нет'}
    </button>
  );
}

/**
 * The view lives outside the table, so the wrapper takes it with the same hook as
 * the screen and passes it to the toolbar and body: field choice works with the view, not with
 * the table model.
 */
function TableHarness({
  rows,
  onReset,
  filtered = false,
  filteredColumns,
}: {
  rows: ConnectionRow[];
  onReset: () => void;
  filtered?: boolean;
  filteredColumns?: ReadonlySet<ConnectionField>;
}) {
  const view = useConnectionView();

  return (
    <ConnectionTable.Root>
      <ConnectionTable.Toolbar view={view} />
      <ConnectionTable.Body
        rows={rows}
        total={rows.length}
        closable
        filtered={filtered}
        onReset={onReset}
        filteredColumns={filteredColumns}
        view={view}
        empty={renderEmpty}
      />
    </ConnectionTable.Root>
  );
}

/** Column labels in header order: the first header button is the sort with the column label. */
function headerLabels() {
  return screen.getAllByRole('columnheader').flatMap((header) => {
    const sort = within(header).queryAllByRole('button').at(0);

    return sort === undefined ? [] : [sort.textContent];
  });
}

describe('table header', () => {
  beforeEach(() => {
    localStorage.clear();
    mockVirtualSizes();
  });

  it('the label in the sort button inherits the header small caps', () => {
    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Куда' })).toHaveClass('[text-transform:inherit]');
  });

  it('carries the filter mark on the column whose field has a facet, and only on it', () => {
    renderWithQuery(
      <TableHarness
        rows={makeRows(4)}
        onReset={vi.fn<() => void>()}
        filtered
        filteredColumns={new Set([CONNECTION_FIELD.Action])}
      />
    );

    expect(screen.getByRole('columnheader', { name: /Действие/ })).toHaveTextContent('есть отбор');
    expect(screen.getByRole('columnheader', { name: /Куда/ })).not.toHaveTextContent('есть отбор');
  });

  it('there is no filter in the header: filtering is set by the screen facets', () => {
    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    for (const header of screen.getAllByRole('columnheader')) {
      expect(within(header).queryAllByRole('button').length).toBeLessThanOrEqual(1);
    }
  });

  it('an empty screen caused by a filter clears the screen filter', async () => {
    const onReset = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={[]} onReset={onReset} filtered />);
    await user.click(screen.getByRole('button', { name: 'Сбросить отбор' }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('list view', () => {
  beforeEach(() => {
    localStorage.clear();
    mockVirtualSizes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('survives a page reload', async () => {
    const user = userEvent.setup();
    const rows = makeRows(4);
    const first = renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    await user.click(screen.getByRole('button', { name: /^Поля/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Сеть' }));
    await user.click(screen.getByRole('button', { name: 'Плотные строки' }));

    expect(screen.getByRole('columnheader', { name: /Сеть/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'true');

    first.unmount();
    renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('columnheader', { name: /Сеть/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the refresh rate survives a page reload', async () => {
    const user = userEvent.setup();
    const rows = makeRows(4);
    const first = renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    await selectOption(user, screen.getByRole('combobox', { name: 'Частота обновления списка' }), '5 с');

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Частота обновления списка' })).toHaveTextContent('5 с');
    });

    first.unmount();
    renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('combobox', { name: 'Частота обновления списка' })).toHaveTextContent('5 с');
  });

  it('moves a column from the field choice, and the order survives a reload', async () => {
    const user = userEvent.setup();
    const rows = makeRows(4);
    const first = renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    expect(headerLabels()).toEqual(['Откуда', 'Куда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);

    await user.click(screen.getByRole('button', { name: /^Поля/ }));
    await user.click(await screen.findByRole('button', { name: 'Поднять поле Куда выше' }));

    expect(headerLabels()).toEqual(['Куда', 'Откуда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
    // The field stood first, "up" went out: focus moves to the neighboring button
    // of the same field instead of being lost.
    expect(screen.getByRole('button', { name: 'Поднять поле Куда выше' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Опустить поле Куда ниже' })).toHaveFocus();

    first.unmount();
    renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    expect(headerLabels()).toEqual(['Куда', 'Откуда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
  });

  it('moves a column from the keyboard without losing focus', async () => {
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    await user.click(screen.getByRole('button', { name: /^Поля/ }));
    screen.getByRole('button', { name: 'Опустить поле Откуда ниже' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    // A hidden column in the field choice also stands in its place: the second step
    // moves the field past it, and the header does not notice it.
    expect(
      screen.getAllByRole('button', { name: /^Опустить поле/ }).map((button) => button.getAttribute('aria-label'))
    ).toEqual(
      ['Куда', 'Сеть', 'Откуда', 'Правило', 'Действие', 'Цепочка', 'Скорость', 'Объём', 'С открытия'].map(
        (column) => `Опустить поле ${column} ниже`
      )
    );
    expect(headerLabels()).toEqual(['Куда', 'Откуда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
    expect(screen.getByRole('button', { name: 'Опустить поле Откуда ниже' })).toHaveFocus();
  });

  it('reset view returns the column set and order at once, and storage gets the default view', async () => {
    const user = userEvent.setup();
    const rows = makeRows(4);
    const first = renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    await user.click(screen.getByRole('button', { name: /^Поля/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Сеть' }));
    await user.click(screen.getByRole('button', { name: 'Поднять поле Куда выше' }));

    expect(screen.getByRole('columnheader', { name: /Сеть/ })).toBeInTheDocument();
    expect(headerLabels()[0]).toBe('Куда');

    // Reset writes columns and order with two setters in a row: the second must not
    // overwrite the first with a view taken before it.
    await user.click(screen.getByRole('button', { name: 'По умолчанию' }));

    expect(headerLabels()).toEqual(['Откуда', 'Куда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();

    first.unmount();
    renderWithQuery(<TableHarness rows={rows} onReset={vi.fn<() => void>()} />);

    expect(headerLabels()).toEqual(['Откуда', 'Куда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      columns: CONNECTION_COLUMNS_HIDDEN,
      order: [],
    });
  });

  it('reset view returns the column order too', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ['age', 'host'] }));
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    await user.click(screen.getByRole('button', { name: /^Поля/ }));
    await user.click(await screen.findByRole('button', { name: 'По умолчанию' }));

    expect(headerLabels()).toEqual(['Откуда', 'Куда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
  });

  // Reset is one view change: two setters in a row would take the view from the same
  // closure, and the second would overwrite the result of the first.
  it('reset view returns hidden columns too, when the order was also changed', async () => {
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    await user.click(screen.getByRole('button', { name: /^Поля/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'Цепочка' }));
    await user.click(screen.getByRole('button', { name: 'Поднять поле Куда выше' }));

    expect(headerLabels()).toEqual(['Куда', 'Откуда', 'Правило', 'Действие', 'Объём', 'С открытия']);

    await user.click(screen.getByRole('button', { name: 'По умолчанию' }));

    expect(headerLabels()).toEqual(['Откуда', 'Куда', 'Правило', 'Действие', 'Цепочка', 'Объём', 'С открытия']);
    expect(screen.getByRole('checkbox', { name: 'Цепочка' })).toBeChecked();
  });

  it('a saved order from another panel version: skips the unknown, puts the missing at the end', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ['age', 'telepathy', 'host'], density: 'compact' }));

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(headerLabels()).toEqual(['С открытия', 'Куда', 'Откуда', 'Правило', 'Действие', 'Цепочка', 'Объём']);
    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('on garbage in storage shows the default view instead of crashing', () => {
    localStorage.setItem(STORAGE_KEY, '{ это не json');

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
  });

  it('a view with unknown values from another panel version is replaced with the default view', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'cozy', interval: 3000, columns: { network: true } }));

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
  });

  it('a missing field of a saved view is taken from the default view, the rest from storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'compact' }));

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Частота обновления списка' })).toHaveTextContent('1 с');
  });
});

describe('narrow screen card', () => {
  beforeEach(() => {
    localStorage.clear();
    mockVirtualSizes();
    vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
      return { matches: true, media, addEventListener: vi.fn<() => void>(), removeEventListener: vi.fn<() => void>() };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function firstCard() {
    const [card] = within(screen.getByRole('list', { name: 'Соединения' })).getAllByRole('listitem');

    return card;
  }

  function fieldLabels(card: HTMLElement) {
    return within(card)
      .getAllByRole('term')
      .map((term) => term.textContent);
  }

  it('starts with the destination host and row actions, not ends with them', () => {
    renderWithQuery(<TableHarness rows={makeRows(3)} onReset={vi.fn<() => void>()} />);

    const card = firstCard();
    const [title, firstField] = within(card).getAllByRole('definition');
    const close = within(card).getByRole('button', { name: 'Закрыть соединение video.example:443' });

    expect(fieldLabels(card)[0]).toBe('Куда');
    expect(title).toHaveTextContent('video.example:443');
    expect(title).toHaveAttribute('title', 'video.example:443');
    expect(close.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('labels every visible field for the screen reader and does not show hidden ones', () => {
    renderWithQuery(<TableHarness rows={makeRows(3)} onReset={vi.fn<() => void>()} />);

    expect(fieldLabels(firstCard())).toEqual([
      'Куда',
      'Правило',
      'Действие',
      'Цепочка',
      'Откуда',
      'С открытия',
      'Объём',
    ]);
  });

  it('shows an enabled column and hides a disabled one', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns: { network: true, rate: false, chain: false } }));

    renderWithQuery(<TableHarness rows={makeRows(3)} onReset={vi.fn<() => void>()} />);

    const labels = fieldLabels(firstCard());

    expect(labels).toContain('Сеть');
    expect(labels).not.toContain('Цепочка');
    expect(labels).not.toContain('Скорость');
  });
});
