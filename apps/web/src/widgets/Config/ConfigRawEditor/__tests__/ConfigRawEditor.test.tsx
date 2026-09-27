import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfigRawEditor } from '../ui/ConfigRawEditor';

const TEXT = '{\n  "log": { "level": 42 }\n}';
const ISSUE_TEXT = 'строка 2, log.level: ожидалась строка';

describe('ConfigRawEditor', () => {
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
});
