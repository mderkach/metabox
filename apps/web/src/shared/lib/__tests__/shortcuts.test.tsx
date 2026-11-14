import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SHORTCUT, useShortcuts } from '../shortcuts';

function Screen({
  onHelp,
  onAdd = vi.fn<() => void>(),
  onAddCustom = vi.fn<() => void>(),
  onApply = vi.fn<() => void>(),
  addDisabled = false,
  applyHidden = false,
  dialog = false,
}: {
  onHelp?: () => void;
  onAdd?: () => void;
  onAddCustom?: () => void;
  onApply?: () => void;
  addDisabled?: boolean;
  applyHidden?: boolean;
  dialog?: boolean;
}) {
  useShortcuts(onHelp);

  return (
    <>
      <input aria-label='Поиск' aria-keyshortcuts={SHORTCUT.Search} defaultValue='github' />
      <input aria-label='Имя' />
      <button type='button' aria-keyshortcuts={SHORTCUT.Add} disabled={addDisabled} onClick={onAdd}>
        Добавить
      </button>
      <button type='button' aria-keyshortcuts={SHORTCUT.AddCustom} onClick={onAddCustom}>
        Свой список
      </button>
      <div hidden={applyHidden}>
        <button type='button' aria-keyshortcuts={SHORTCUT.Apply} onClick={onApply}>
          Применить
        </button>
      </div>
      {dialog && (
        <div role='dialog' aria-modal='true' aria-label='Диалог'>
          <button type='button'>Закрыть</button>
        </div>
      )}
    </>
  );
}

/** Returns whether the browser keeps the key: `false` means the shortcut took it. */
function press(init: KeyboardEventInit, target: Element = document.body): boolean {
  // oxlint-disable-next-line testing-library/prefer-user-event -- needs a key and a code of another layout, and the default-prevented result
  return fireEvent.keyDown(target, init);
}

describe('useShortcuts', () => {
  it('/ puts focus into the search field with its text selected', () => {
    render(<Screen />);

    press({ key: '/', code: 'Slash' });

    const search = screen.getByRole<HTMLInputElement>('textbox', { name: 'Поиск' });

    expect(search).toHaveFocus();
    expect([search.selectionStart, search.selectionEnd]).toEqual([0, 'github'.length]);
  });

  it('N clicks the add button, also on the Russian layout', () => {
    const onAdd = vi.fn<() => void>();

    render(<Screen onAdd={onAdd} />);

    press({ key: 'n', code: 'KeyN' });
    press({ key: 'т', code: 'KeyN' });

    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it('a letter typed into a text field stays a letter', () => {
    const onAdd = vi.fn<() => void>();

    render(<Screen onAdd={onAdd} />);
    screen.getByRole('textbox', { name: 'Имя' }).focus();

    expect(press({ key: 'n', code: 'KeyN' }, screen.getByRole('textbox', { name: 'Имя' }))).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('Cmd+S and Ctrl+S apply even from a text field', () => {
    const onApply = vi.fn<() => void>();

    render(<Screen onApply={onApply} />);
    screen.getByRole('textbox', { name: 'Имя' }).focus();

    expect(press({ key: 's', code: 'KeyS', metaKey: true })).toBe(false);
    press({ key: 'ы', code: 'KeyS', ctrlKey: true });

    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('with nothing to apply, Cmd+S does not open the browser save dialog', () => {
    render(<Screen applyHidden />);

    expect(press({ key: 's', code: 'KeyS', metaKey: true })).toBe(false);
  });

  it('skips a disabled control and leaves the key to the browser', () => {
    const onAdd = vi.fn<() => void>();

    render(<Screen onAdd={onAdd} addDisabled />);

    expect(press({ key: 'n', code: 'KeyN' })).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('a control behind an open modal dialog is out of reach', () => {
    const onAdd = vi.fn<() => void>();

    render(<Screen onAdd={onAdd} dialog />);

    press({ key: 'n', code: 'KeyN' });

    expect(onAdd).not.toHaveBeenCalled();
  });

  it('? opens the shortcut list and does not take the search behind the same key', () => {
    const onHelp = vi.fn<() => void>();

    render(<Screen onHelp={onHelp} />);

    expect(press({ key: '?', code: 'Slash', shiftKey: true })).toBe(false);
    press({ key: ',', code: 'Slash', shiftKey: true });

    expect(onHelp).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: 'Поиск' })).not.toHaveFocus();
  });

  it('? is a typed character in a text field and does nothing over an open dialog', () => {
    const onHelp = vi.fn<() => void>();

    const { rerender } = render(<Screen onHelp={onHelp} />);
    const name = screen.getByRole('textbox', { name: 'Имя' });

    name.focus();

    expect(press({ key: '?', code: 'Slash', shiftKey: true }, name)).toBe(true);

    name.blur();
    rerender(<Screen onHelp={onHelp} dialog />);
    press({ key: '?', code: 'Slash', shiftKey: true });

    expect(onHelp).not.toHaveBeenCalled();
  });

  it('Shift+N clicks its own control and not the one behind N, also on the Russian layout', () => {
    const onAdd = vi.fn<() => void>();
    const onAddCustom = vi.fn<() => void>();

    render(<Screen onAdd={onAdd} onAddCustom={onAddCustom} />);

    press({ key: 'N', code: 'KeyN', shiftKey: true });
    press({ key: 'Т', code: 'KeyN', shiftKey: true });

    expect(onAddCustom).toHaveBeenCalledTimes(2);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('Shift+N is a typed letter in a text field and is out of reach behind a dialog', () => {
    const onAddCustom = vi.fn<() => void>();

    const { rerender } = render(<Screen onAddCustom={onAddCustom} />);
    const name = screen.getByRole('textbox', { name: 'Имя' });

    name.focus();

    expect(press({ key: 'N', code: 'KeyN', shiftKey: true }, name)).toBe(true);

    name.blur();
    rerender(<Screen onAddCustom={onAddCustom} dialog />);
    press({ key: 'N', code: 'KeyN', shiftKey: true });

    expect(onAddCustom).not.toHaveBeenCalled();
  });
});
