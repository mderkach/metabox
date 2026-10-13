import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ConnectionFacetValue } from '@entities/Connection';

import { ConnectionFacetFilter, type ConnectionFacetText } from '../ui/ConnectionFacetFilter';

const VALUES: readonly ConnectionFacetValue[] = [
  { value: '192.168.1.36', count: 3 },
  { value: '192.168.1.60', count: 12 },
  { value: '192.168.1.120', count: 0 },
];

const LABELS = new Map([['192.168.1.60', 'Ноутбук гостя']]);

function describeSource(value: string): ConnectionFacetText {
  const label = LABELS.get(value) ?? value;

  return { label, detail: label === value ? null : value };
}

/** Выбор живёт снаружи — в адресе экрана; обёртка держит его состоянием. */
function Harness({
  initial = [],
  onChange = vi.fn<(values: readonly string[]) => void>(),
}: {
  initial?: readonly string[];
  onChange?: (values: readonly string[]) => void;
}) {
  const [selected, setSelected] = useState(initial);

  return (
    <ConnectionFacetFilter
      label='Устройство'
      values={VALUES}
      selected={selected}
      describe={describeSource}
      onSelectedChange={(values) => {
        setSelected(values);
        onChange(values);
      }}
    />
  );
}

describe('ConnectionFacetFilter', () => {
  it('открывает список значений со счётчиками, поиском в фокусе и множественным выбором', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Устройство' }));

    const list = await screen.findByRole('listbox', { name: 'Устройство' });

    expect(list).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByRole('textbox', { name: 'Найти значение: Устройство' })).toHaveFocus();
    expect(within(list).getAllByRole('option')).toHaveLength(3);
    expect(within(list).getByRole('option', { name: /Ноутбук гостя/ })).toHaveTextContent('192.168.1.6012');
    expect(within(list).getByRole('option', { name: /Ноутбук гостя/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('сужает список поиском по подписи и по адресу', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Устройство' }));
    await user.type(await screen.findByRole('textbox', { name: 'Найти значение: Устройство' }), 'ноут');

    expect(screen.getAllByRole('option')).toHaveLength(1);

    await user.clear(screen.getByRole('textbox', { name: 'Найти значение: Устройство' }));
    await user.type(screen.getByRole('textbox', { name: 'Найти значение: Устройство' }), '.120');

    expect(screen.getByRole('option')).toHaveTextContent('192.168.1.120');

    await user.type(screen.getByRole('textbox', { name: 'Найти значение: Устройство' }), 'zzz');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('Ничего не нашлось')).toBeInTheDocument();
  });

  it('выбирает несколько значений и называет выбор на кнопке', async () => {
    const onChange = vi.fn<(values: readonly string[]) => void>();
    const user = userEvent.setup();

    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Устройство' }));
    await user.click(await screen.findByRole('option', { name: /Ноутбук гостя/ }));

    expect(onChange).toHaveBeenLastCalledWith(['192.168.1.60']);
    expect(screen.getByRole('option', { name: /Ноутбук гостя/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Устройство: Ноутбук гостя' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /192\.168\.1\.36/ }));

    expect(onChange).toHaveBeenLastCalledWith(['192.168.1.60', '192.168.1.36']);
    expect(screen.getByRole('button', { name: 'Устройство: выбрано 2' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Ноутбук гостя/ }));

    expect(onChange).toHaveBeenLastCalledWith(['192.168.1.36']);
  });

  it('ходит по списку с клавиатуры: стрелки, пробел, Enter и возврат в поиск', async () => {
    const onChange = vi.fn<(values: readonly string[]) => void>();
    const user = userEvent.setup();

    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Устройство' }));

    const input = await screen.findByRole('textbox', { name: 'Найти значение: Устройство' });
    const [first, second] = screen.getAllByRole('option');

    await user.keyboard('{ArrowDown}');

    expect(first).toHaveFocus();

    await user.keyboard('{ArrowDown}');

    expect(second).toHaveFocus();

    await user.keyboard(' ');

    expect(onChange).toHaveBeenLastCalledWith(['192.168.1.60']);

    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenLastCalledWith([]);

    await user.keyboard('{ArrowUp}{ArrowUp}');

    expect(input).toHaveFocus();
  });

  it('сброс снимает выбор фасета, а Esc закрывает список', async () => {
    const onChange = vi.fn<(values: readonly string[]) => void>();
    const user = userEvent.setup();

    render(<Harness initial={['192.168.1.60', '192.168.1.36']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Устройство: выбрано 2' }));
    await user.click(await screen.findByRole('button', { name: 'Сбросить' }));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('button', { name: 'Сбросить' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Найти значение: Устройство' })).toHaveFocus();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Устройство' })).toHaveAttribute('aria-expanded', 'false');
  });
});
