import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { JsonTextarea } from '../JsonTextarea';

const LABEL = 'Узел текстом';
const TEXT = '{\n  "outbounds": [\n    { "tag": "direct" },\n    { "tag": "block" }\n  ]\n}';

function Editor({ initial, onEscape }: { initial: string; onEscape?: () => void }) {
  const [value, setValue] = useState(initial);

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for a panel that closes on Escape
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onEscape?.();
        }
      }}
    >
      <JsonTextarea id='json' label={LABEL} value={value} onChange={setValue} />
      <button type='button'>after</button>
    </div>
  );
}

function field(): HTMLTextAreaElement {
  const input = screen.getByRole('textbox', { name: LABEL });

  if (!(input instanceof HTMLTextAreaElement)) {
    throw new TypeError('the field is not a textarea');
  }

  return input;
}

function selectLines(input: HTMLTextAreaElement, first: string, last: string) {
  input.focus();
  input.setSelectionRange(input.value.indexOf(first), input.value.indexOf(last) + last.length);
}

describe('JsonTextarea keys in a real browser', () => {
  it('indents the selected lines with the unit of the text and keeps them selected', async () => {
    render(<Editor initial={TEXT} />);

    const input = field();

    selectLines(input, '{ "tag": "direct" }', '{ "tag": "block" }');
    await userEvent.keyboard('{Tab}');

    expect(input).toHaveFocus();
    expect(input.value).toBe('{\n  "outbounds": [\n      { "tag": "direct" },\n      { "tag": "block" }\n  ]\n}');
    expect(input.value.slice(input.selectionStart, input.selectionEnd)).toBe(
      '{ "tag": "direct" },\n      { "tag": "block" }'
    );
  });

  it('outdents with Shift+Tab and the browser undo brings the text back', async () => {
    render(<Editor initial={TEXT} />);

    const input = field();

    selectLines(input, '{ "tag": "direct" }', '{ "tag": "block" }');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');

    expect(input.value).toBe('{\n  "outbounds": [\n  { "tag": "direct" },\n  { "tag": "block" }\n  ]\n}');

    // The undo command, not a shortcut: Ctrl+Z and Cmd+Z depend on the platform the test runs on.
    document.execCommand('undo');

    expect(input.value).toBe(TEXT);
  });

  it('indents with a tab in a tab-indented text', async () => {
    render(<Editor initial={'{\n\t"tag": "direct"\n}'} />);

    const input = field();

    input.focus();
    input.setSelectionRange(2, 2);
    await userEvent.keyboard('{Tab}');

    expect(input.value).toBe('{\n\t\t"tag": "direct"\n}');
  });

  it('leaves the field on Escape then Tab, and only the second Escape reaches the panel', async () => {
    const onEscape = vi.fn<() => void>();

    render(<Editor initial={TEXT} onEscape={onEscape} />);

    const input = field();

    input.focus();
    await userEvent.keyboard('{Escape}');

    expect(onEscape).not.toHaveBeenCalled();

    await userEvent.keyboard('{Tab}');

    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
    expect(input.value).toBe(TEXT);

    input.focus();
    await userEvent.keyboard('{Escape}{Escape}');

    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('leaves the field backwards on Escape then Shift+Tab', async () => {
    render(<Editor initial={TEXT} />);

    const input = field();

    input.focus();
    await userEvent.keyboard('{Escape}{Shift>}{Tab}{/Shift}');

    expect(input).not.toHaveFocus();
    expect(input.value).toBe(TEXT);
  });

  it('keeps Tab in the field when another key comes between Escape and Tab', async () => {
    render(<Editor initial='{}' />);

    const input = field();

    input.focus();
    input.setSelectionRange(1, 1);
    await userEvent.keyboard('{Escape}{ArrowLeft}{ArrowRight}{Tab}');

    expect(input).toHaveFocus();
    expect(input.value).toBe('{  }');
  });

  it('tells a screen reader how to leave the field', () => {
    render(<Editor initial='{}' />);

    expect(field()).toHaveAccessibleDescription(/Escape/);
  });
});
