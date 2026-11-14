import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TokenInput } from '../TokenInput';
import type { TokenSuggestion } from '../TokenInput.lib';

const PORTS: TokenSuggestion[] = [
  { value: '443', hint: 'HTTPS' },
  { value: '80', hint: 'HTTP' },
  { value: '853', hint: 'DNS over TLS' },
];

function Harness({
  initial = [],
  onChange = vi.fn<(value: string[]) => void>(),
  isValid,
  lines = false,
  suggestions,
}: {
  initial?: string[];
  onChange?: (value: string[]) => void;
  isValid?: (token: string) => boolean;
  lines?: boolean;
  suggestions?: TokenSuggestion[];
}) {
  const [value, setValue] = useState(initial);

  return (
    <TokenInput
      aria-label='Домен'
      label='Домен'
      value={value}
      isValid={isValid}
      separator={lines ? /\n/ : undefined}
      distinct={!lines}
      suggestions={suggestions === undefined ? undefined : () => suggestions}
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

  it('with a line separator keeps spaces, commas and repeats inside values', async () => {
    const user = userEvent.setup();

    render(<Harness lines />);
    await user.click(screen.getByRole('textbox', { name: 'Домен' }));
    await user.paste('-----BEGIN CERTIFICATE-----\na, b\n-----BEGIN CERTIFICATE-----\n');

    expect(chips()).toEqual(['-----BEGIN CERTIFICATE-----', 'a, b', '-----BEGIN CERTIFICATE-----']);
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

  it('shows the name of a value on its chip before the value itself', () => {
    render(
      <TokenInput
        label='Источник'
        aria-label='Источник'
        value={['192.168.1.60/32', '10.0.0.0/8']}
        onValueChange={vi.fn<(value: string[]) => void>()}
        tokenLabel={(token) => (token === '192.168.1.60/32' ? 'Ноутбук' : undefined)}
      />
    );

    const [device, subnet] = within(screen.getByRole('list', { name: 'Источник: значения' })).getAllByRole('listitem');

    expect(device).toHaveTextContent('Ноутбук 192.168.1.60/32');
    expect(subnet).toHaveTextContent(/^10\.0\.0\.0\/8$/);
  });
});

describe('TokenInput suggestions', () => {
  function field() {
    return screen.getByRole('combobox', { name: 'Домен' });
  }

  function offered(): string[] {
    const list = screen.queryByRole('listbox', { name: 'Домен: подсказки' });

    return list === null
      ? []
      : within(list)
          .getAllByRole('option')
          .map((option) => option.textContent);
  }

  it('opens on focus, names the list and shows what each value is', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.click(field());

    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(offered()).toEqual(['443 HTTPS', '80 HTTP', '853 DNS over TLS']);
  });

  it('narrows the list by the value or its hint as you type', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.type(field(), 'dns');

    expect(offered()).toEqual(['853 DNS over TLS']);
  });

  it('does not offer a value that is already a chip', async () => {
    const user = userEvent.setup();

    render(<Harness initial={['443']} suggestions={PORTS} />);
    await user.click(field());

    expect(offered()).toEqual(['80 HTTP', '853 DNS over TLS']);
  });

  it('takes the highlighted suggestion on Enter and keeps focus for the next value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string[]) => void>();

    render(<Harness suggestions={PORTS} onChange={onChange} />);
    await user.type(field(), '8');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(chips()).toEqual(['853']);
    expect(onChange).toHaveBeenLastCalledWith(['853']);
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();
  });

  it('takes the highlighted suggestion on Tab without leaving the field', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.click(field());
    await user.keyboard('{ArrowDown}');
    await user.tab();

    expect(chips()).toEqual(['443']);
    expect(field()).toHaveFocus();
  });

  it('closes the list on Escape and keeps the typed text in the field', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.type(field(), '44');
    await user.keyboard('{Escape}');

    expect(field()).toHaveAttribute('aria-expanded', 'false');
    expect(field()).toHaveValue('44');
    expect(field()).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(field()).toHaveValue('44');
  });

  it('closes a typed value that is not in the list on Enter, as without suggestions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: string[]) => void>();

    render(<Harness suggestions={PORTS} onChange={onChange} />);
    await user.type(field(), '44{Enter}8080,22 {Escape}');

    expect(chips()).toEqual(['44', '8080', '22']);
    expect(onChange).toHaveBeenLastCalledWith(['44', '8080', '22']);
  });

  it('lets Tab leave the field when nothing is highlighted', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.type(field(), '8080');
    await user.tab();

    expect(chips()).toEqual(['8080']);
    expect(field()).not.toHaveFocus();
    expect(field()).toHaveAttribute('aria-expanded', 'false');
  });

  it('splits a pasted list into chips', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.click(field());
    await user.paste('443\n8080, 22');

    expect(chips()).toEqual(['443', '8080']);
    expect(field()).toHaveValue('22');
  });

  it('reopens the list on ArrowDown after Escape', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.click(field());
    await user.keyboard('{Escape}');

    expect(field()).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowDown}');

    expect(field()).toHaveAttribute('aria-expanded', 'true');
  });

  it('says under the list that Enter adds the typed text', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.type(field(), '4');

    expect(screen.getByText(/Enter добавит/)).toHaveTextContent('Enter добавит 4 · ↓ — выбрать из списка');
  });

  it('names the highlighted suggestion as what Enter adds and describes the field with it', async () => {
    const user = userEvent.setup();

    render(<Harness suggestions={PORTS} />);
    await user.type(field(), '4');
    await user.keyboard('{ArrowDown}');

    const footer = screen.getByText(/Enter добавит/);

    expect(footer).toHaveTextContent('Enter добавит 443 · Esc — закрыть список');
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(footer.id);
  });

  it('announces how many suggestions the list offers', async () => {
    const user = userEvent.setup();

    render(<Harness initial={['22']} suggestions={PORTS} />);
    await user.click(field());

    expect(screen.getByRole('status')).toHaveTextContent('3 подсказки');
  });

  it('closes the list on Escape without letting the key reach the dialog around the field', async () => {
    const user = userEvent.setup();
    const onDialogKey = vi.fn<(key: string) => void>();

    render(
      // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands for a dialog that closes on Escape
      <div
        onKeyDown={(event) => {
          onDialogKey(event.key);
        }}
      >
        <Harness suggestions={PORTS} />
      </div>
    );
    await user.click(field());
    await user.keyboard('{Escape}');

    expect(onDialogKey).not.toHaveBeenCalledWith('Escape');

    await user.keyboard('{Escape}');

    expect(onDialogKey).toHaveBeenCalledWith('Escape');
  });

  it('lists suggestions under their group headings, a name before its address', async () => {
    const user = userEvent.setup();

    render(
      <Harness
        suggestions={[
          { value: '192.168.1.60/32', label: 'Ноутбук', hint: '192.168.1.60', group: 'Устройства' },
          { value: '192.168.1.0/24', hint: 'локальная сеть', group: 'Сети' },
        ]}
      />
    );
    await user.click(field());

    expect(within(screen.getByRole('group', { name: 'Устройства' })).getByRole('option')).toHaveTextContent(
      'Ноутбук 192.168.1.60'
    );
    expect(within(screen.getByRole('group', { name: 'Сети' })).getByRole('option')).toHaveTextContent(
      '192.168.1.0/24 локальная сеть'
    );

    await user.click(screen.getByRole('option', { name: /Ноутбук/ }));

    expect(chips()).toEqual(['192.168.1.60/32']);
    expect(field()).toHaveFocus();
  });
});
