import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TokenInput } from '../TokenInput';

function Harness({
  initial = [],
  onChange = vi.fn<(value: string[]) => void>(),
  isValid,
}: {
  initial?: string[];
  onChange?: (value: string[]) => void;
  isValid?: (token: string) => boolean;
}) {
  const [value, setValue] = useState(initial);

  return (
    <TokenInput
      aria-label='Домен'
      label='Домен'
      value={value}
      isValid={isValid}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function chips(): string[] {
  const list = screen.queryByRole('list', { name: 'Домен: значения' });

  return list === null
    ? []
    : within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent);
}

describe('TokenInput', () => {
  it('counts the text being typed as a value before it is closed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string[]) => void>();

    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Домен' }), 'a.example');

    expect(onChange).toHaveBeenLastCalledWith(['a.example']);
    expect(chips()).toEqual([]);
  });

  it('closes a value on Enter, a comma or a space and drops a repeat', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string[]) => void>();

    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Домен' }), 'a.example{Enter}b.example,c.example a.example ');

    expect(chips()).toEqual(['a.example', 'b.example', 'c.example']);
    expect(onChange).toHaveBeenLastCalledWith(['a.example', 'b.example', 'c.example']);
  });

  it('splits a pasted list into chips', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.click(screen.getByRole('textbox', { name: 'Домен' }));
    await user.paste('a.example\nb.example, c.example');

    expect(chips()).toEqual(['a.example', 'b.example']);
    expect(screen.getByRole('textbox', { name: 'Домен' })).toHaveValue('c.example');
  });

  it('Backspace in an empty field takes the last chip back for editing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string[]) => void>();

    render(<Harness initial={['a.example', 'b.example']} onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Домен' }), '{Backspace}{Backspace}');

    expect(chips()).toEqual(['a.example']);
    expect(screen.getByRole('textbox', { name: 'Домен' })).toHaveValue('b.exampl');
    expect(onChange).toHaveBeenLastCalledWith(['a.example', 'b.exampl']);
  });

  it('removes a chip by its button and returns focus to the field', async () => {
    const user = userEvent.setup();

    render(<Harness initial={['a.example', 'b.example']} />);
    await user.click(screen.getByRole('button', { name: 'Убрать a.example' }));

    expect(chips()).toEqual(['b.example']);
    expect(screen.getByRole('textbox', { name: 'Домен' })).toHaveFocus();
  });

  it('closes the typed value when focus leaves', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.type(screen.getByRole('textbox', { name: 'Домен' }), 'a.example');
    await user.tab();

    expect(chips()).toEqual(['a.example']);
  });

  it('marks a chip that fails the check', () => {
    render(<Harness initial={['443', 'https']} isValid={(token) => /^\d+$/.test(token)} />);

    const [port, word] = within(screen.getByRole('list', { name: 'Домен: значения' })).getAllByRole('listitem');

    expect(port).not.toHaveTextContent('ошибка');
    expect(word).toHaveTextContent('https, ошибка');
  });
});
