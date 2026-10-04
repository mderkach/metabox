import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NARROW_SCREEN } from '@shared/lib/media';

import { ConfigRawEditor } from '../ui/ConfigRawEditor';

const TEXT = '{\n  "log": { "level": 42 }\n}';
const ISSUE_TEXT = 'строка 2, log.level: ожидалась строка';

/** `matchMedia` в jsdom нет — подставляем ответ только на запрос узкой ширины. */
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
  });

  it('замечание с позицией ведёт к узлу в тексте', async () => {
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

  it('замечание без позиции остаётся текстом, а не кнопкой', () => {
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

  describe('перенос строк', () => {
    it('на широком экране по умолчанию выключен', () => {
      renderEditor();

      expect(screen.getByRole('button', { name: 'Перенос строк' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'off');
    });

    it('на узком экране по умолчанию включён', () => {
      mockNarrowScreen();
      renderEditor();

      expect(screen.getByRole('button', { name: 'Перенос строк' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'soft');
    });

    it('выбор переживает перезагрузку страницы', async () => {
      const user = userEvent.setup();
      const first = renderEditor();

      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));

      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'soft');

      first.unmount();
      renderEditor();

      expect(screen.getByRole('button', { name: 'Перенос строк' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'soft');
    });

    it('сохранённый выбор перекрывает ширину экрана', async () => {
      const user = userEvent.setup();
      const first = renderEditor();

      // Включить и выключить: в хранилище остаётся явный отказ от переноса.
      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));
      await user.click(screen.getByRole('button', { name: 'Перенос строк' }));
      first.unmount();

      mockNarrowScreen();
      renderEditor();

      expect(screen.getByLabelText('Конфиг sing-box текстом')).toHaveAttribute('wrap', 'off');
    });
  });
});
