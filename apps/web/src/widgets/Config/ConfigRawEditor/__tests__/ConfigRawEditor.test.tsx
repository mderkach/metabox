import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NARROW_SCREEN } from '@shared/lib/media';

import { ConfigRawEditor } from '../ui/ConfigRawEditor';

const TEXT = '{\n  "log": { "level": 42 }\n}';
const ISSUE_TEXT = 'строка 2, log.level: ожидалась строка';

/** jsdom has no `matchMedia`: answer only the narrow-width query. */
function mockNarrowScreen() {
  vi.stubGlobal('matchMedia', function matchNarrowQuery(media: string) {
    return {
      matches: media === NARROW_SCREEN,
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    };
  });
}

function renderEditor() {
  return render(<ConfigRawEditor text={TEXT} onChange={vi.fn<(next: string) => void>()} issues={[]} />);
}

describe('ConfigRawEditor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('an issue with a position leads to the node in the text', async () => {
    const user = userEvent.setup();
    const offset = TEXT.indexOf('42');

    render(
      <ConfigRawEditor text={TEXT} onChange={vi.fn<(next: string) => void>()} issues={[{ text: ISSUE_TEXT, offset }]} />
    );

    await user.click(screen.getByRole('button', { name: ISSUE_TEXT }));

    const input = screen.getByLabelText('Конфиг sing-box текстом');

    expect(input).toHaveFocus();
    expect(input).toHaveProperty('selectionStart', offset);
  });

  it('an issue without a position stays text, not a button', () => {
    render(
      <ConfigRawEditor
        text={TEXT}
        onChange={vi.fn<(next: string) => void>()}
        issues={[{ text: ISSUE_TEXT, offset: null }]}
      />
    );

    expect(screen.queryByRole('button', { name: ISSUE_TEXT })).not.toBeInTheDocument();
    expect(screen.getByText(ISSUE_TEXT)).toBeInTheDocument();
  });

  // Parsing is deferred behind the input, so the error is awaited, not checked at once.
  it('after input shows a parse error with the line and keeps what was typed', async () => {
    const user = userEvent.setup();

    renderEditor();

    const input = screen.getByLabelText('Конфиг sing-box текстом');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '{{ "log": ');

    expect(await screen.findByRole('alert')).toHaveTextContent(/^строка 1: /);
    expect(input).toHaveValue('{ "log": ');
  });

  describe('table of contents', () => {
    const ROUTED =
      '{\n  // логи\n  "log": {},\n  "route": {\n    "rules": [{ "outbound": "direct" }],\n    "final": "direct",\n  },\n}';

    it('leads from the table of contents to a nested section and puts the cursor on its key', async () => {
      const user = userEvent.setup();

      render(<ConfigRawEditor text={ROUTED} onChange={vi.fn<(next: string) => void>()} issues={[]} />);
      await user.click(screen.getByRole('button', { name: 'Перейти к секции' }));

      const outline = within(await screen.findByRole('list', { name: 'Секции конфига' }));

      expect(outline.getByRole('button', { name: 'route' })).toBeInTheDocument();
      expect(outline.queryByRole('button', { name: /final/ })).not.toBeInTheDocument();

      await user.click(outline.getByRole('button', { name: /^rules/ }));

      // Focus is checked when the window is already closed: closing must not return
      // it to the table of contents button.
      await waitFor(() => {
        expect(screen.queryByRole('list', { name: 'Секции конфига' })).not.toBeInTheDocument();
      });

      const input = screen.getByLabelText('Конфиг sing-box текстом');

      expect(input).toHaveFocus();
      expect(input).toHaveProperty('selectionStart', ROUTED.indexOf('"rules"'));
      expect(input).toHaveProperty('selectionEnd', ROUTED.indexOf('"rules"') + '"rules"'.length);
    });

    it('on text without a root object says there are no sections', async () => {
      const user = userEvent.setup();

      render(<ConfigRawEditor text='[' onChange={vi.fn<(next: string) => void>()} issues={[]} />);
      await user.click(screen.getByRole('button', { name: 'Перейти к секции' }));

      expect(await screen.findByText('Секций нет: текст не разобран')).toBeInTheDocument();
    });
  });

  describe('line wrapping', () => {
    it('on a wide screen is off by default', () => {
      renderEditor();

      expect(screen.getByRole('button', { name: 'Перенос строк' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'off');
    });

    it('on a narrow screen is on by default', () => {
      mockNarrowScreen();
      renderEditor();

      expect(screen.getByRole('button', { name: 'Перенос строк' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'soft');
    });

    it('the choice survives a page reload', async () => {
      const user = userEvent.setup();
      const first = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));

      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'soft');

      first.unmount();
      renderEditor();

      expect(screen.getByRole('button', { name: 'Перенос строк' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'soft');
    });

    it('returned line numbers stand on the field scroll', async () => {
      mockNarrowScreen();
      const user = userEvent.setup();
      renderEditor();
      const input = screen.getByLabelText('Конфиг sing-box текстом');

      // jsdom does not compute scrolling: the value is set on the field directly, and
      // the write to the number column is caught on the setter.
      Object.defineProperty(input, 'scrollTop', { configurable: true, value: 120 });
      const setScroll = vi.spyOn(Element.prototype, 'scrollTop', 'set');

      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));

      // The last line number exists only in the number column.
      const lastLine = screen.getByText('3');
      const written = setScroll.mock.calls.filter(
        (_, index) =>
          setScroll.mock.contexts[index] instanceof Element && setScroll.mock.contexts[index].contains(lastLine)
      );

      expect(written).toContainEqual([120]);
    });

    it('a saved choice overrides the screen width', async () => {
      const user = userEvent.setup();
      const first = renderEditor();

      // Turn on and off: storage keeps an explicit refusal of wrapping.
      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));
      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));
      first.unmount();

      mockNarrowScreen();
      renderEditor();

      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'off');
    });
  });
});
