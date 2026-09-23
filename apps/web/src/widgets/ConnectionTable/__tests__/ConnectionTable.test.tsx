import { renderWithQuery } from '@test/renderWithQuery';
import { selectOption } from '@test/selectOption';
import { mockVirtualSizes } from '@test/virtualSizes';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionStore, type ConnectionRow } from '@entities/Connection';
import { makeConnectionsSnapshot } from '@entities/Connection/__tests__/Connection.fixture';

import { useConnectionView } from '../lib';
import { ConnectionTable, type ConnectionTableEmpty } from '../ui/ConnectionTable';

const STORAGE_KEY = 'metabox.connections.view';

/** Строки собираются настоящим разбором снапшота: отбор работает по его полям. */
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

/** Вид живёт снаружи таблицы, поэтому обёртка берёт его тем же хуком, что и экран. */
function TableHarness({ rows, onReset }: { rows: ConnectionRow[]; onReset: () => void }) {
  const view = useConnectionView();

  return (
    <ConnectionTable
      rows={rows}
      total={rows.length}
      closable
      filtered={false}
      onReset={onReset}
      view={view}
      empty={renderEmpty}
    />
  );
}

async function openHostFilter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Фильтр по колонке Куда' }));

  return screen.findByRole('textbox', { name: 'Подстрока в колонке Куда' });
}

describe('фильтр по колонке', () => {
  beforeEach(() => {
    localStorage.clear();
    mockVirtualSizes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('отбирает строки по подстроке', async () => {
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={makeRows(8)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('status')).toHaveTextContent('8 соединений');

    await user.type(await openHostFilter(user), 'google');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Показано 1 из 8');
    });
  });

  it('показывает признак поставленного фильтра на кнопке колонки', async () => {
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={makeRows(8)} onReset={vi.fn<() => void>()} />);

    await user.type(await openHostFilter(user), 'google');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Фильтр по колонке Куда: активен' })).toBeInTheDocument();
    });
  });

  it('сброс на пустом экране снимает и фильтр колонки, и отбор экрана', async () => {
    const onReset = vi.fn<() => void>();
    const user = userEvent.setup();

    renderWithQuery(<TableHarness rows={makeRows(8)} onReset={onReset} />);

    await user.type(await openHostFilter(user), 'такого хоста нет');
    await user.click(await screen.findByRole('button', { name: 'Сбросить отбор' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('8 соединений');
    });
  });
});

describe('шапка таблицы', () => {
  beforeEach(() => {
    localStorage.clear();
    mockVirtualSizes();
  });

  it('подпись в кнопке сортировки наследует капитель шапки', () => {
    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Куда' })).toHaveClass('[text-transform:inherit]');
  });
});

describe('вид списка', () => {
  beforeEach(() => {
    localStorage.clear();
    mockVirtualSizes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('переживает перезагрузку страницы', async () => {
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

  it('частота обновления переживает перезагрузку страницы', async () => {
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

  it('на мусоре в хранилище показывает вид по умолчанию, а не падает', () => {
    localStorage.setItem(STORAGE_KEY, '{ это не json');

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
  });

  it('вид с незнакомыми значениями другой версии панели заменяется видом по умолчанию', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'cozy', interval: 3000, columns: { network: true } }));

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
  });

  it('недостающее поле сохранённого вида берётся из вида по умолчанию, остальные — из хранилища', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'compact' }));

    renderWithQuery(<TableHarness rows={makeRows(4)} onReset={vi.fn<() => void>()} />);

    expect(screen.getByRole('button', { name: 'Плотные строки' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('columnheader', { name: /Сеть/ })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Частота обновления списка' })).toHaveTextContent('1 с');
  });
});

describe('карточка узкого экрана', () => {
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

  it('начинается с хоста назначения и действий строки, а не заканчивается ими', () => {
    renderWithQuery(<TableHarness rows={makeRows(3)} onReset={vi.fn<() => void>()} />);

    const card = firstCard();
    const [title, firstField] = within(card).getAllByRole('definition');
    const close = within(card).getByRole('button', { name: 'Закрыть соединение video.example:443' });

    expect(fieldLabels(card)[0]).toBe('Куда');
    expect(title).toHaveTextContent('video.example:443');
    expect(title).toHaveAttribute('title', 'video.example:443');
    expect(close.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('подписывает для скринридера каждое видимое поле и не показывает скрытые', () => {
    renderWithQuery(<TableHarness rows={makeRows(3)} onReset={vi.fn<() => void>()} />);

    expect(fieldLabels(firstCard())).toEqual(['Куда', 'Правило', 'Действие', 'Цепочка', 'Откуда', 'Время', 'Объём']);
  });

  it('показывает включённую колонку и прячет выключенную', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns: { network: true, rate: false, chain: false } }));

    renderWithQuery(<TableHarness rows={makeRows(3)} onReset={vi.fn<() => void>()} />);

    const labels = fieldLabels(firstCard());

    expect(labels).toContain('Сеть');
    expect(labels).not.toContain('Цепочка');
    expect(labels).not.toContain('Скорость');
  });
});
