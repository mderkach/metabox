import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RULE_TARGET, type RuleRow as RuleRowModel } from '@entities/Rule';

import { RuleRow } from '../ui/RuleRow';

const TARGET = 'proxy-eu-reality-frankfurt-02';

const RULE: RuleRowModel = {
  id: '3',
  index: 4,
  matchers: [],
  group: null,
  invert: false,
  target: TARGET,
  targetKind: RULE_TARGET.Outbound,
  targetDetail: null,
  isCatchAll: true,
  recognized: true,
  searchText: TARGET,
};

const NO_TYPES: ReadonlyMap<string, string> = new Map();

/** Ширина текста в jsdom — ноль, поэтому обрезку изображает текст шире ячейки. */
const CUT_WIDTH = 400;

/** Дольше задержки, с которой подсказка открывается при наведении. */
const HINT_WAIT_MS = 1000;

/**
 * Наведение мышью с ожиданием задержки подсказки. Часы фейковые, но идут и
 * сами: Testing Library после каждого действия ждёт настоящего `setTimeout(0)`,
 * и на остановленных часах `user-event` зависает.
 */
async function hover(element: HTMLElement) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  await user.hover(element);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(HINT_WAIT_MS);
  });
}

function renderRow() {
  render(
    <div role='table'>
      <RuleRow
        rule={RULE}
        rowIndex={1}
        selected={false}
        edited={false}
        hits={undefined}
        outboundTypes={NO_TYPES}
        onSelect={vi.fn<(id: string) => void>()}
      />
    </div>
  );
}

describe('RuleRow', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('кнопка выбора называет строку номером и выходом', () => {
    renderRow();

    expect(screen.getByRole('button', { name: `Правило 4, выход ${TARGET}` })).toBeInTheDocument();
  });

  // Кнопка перекрывает строку, и `title` выхода под ней не показывался.
  it('показывает обрезанный выход целиком подсказкой при наведении на строку', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(CUT_WIDTH);

    renderRow();
    await hover(screen.getByRole('button', { name: `Правило 4, выход ${TARGET}` }));

    expect(screen.getAllByText(TARGET)).toHaveLength(2);
  });

  it('без обрезки подсказку не показывает', async () => {
    renderRow();
    await hover(screen.getByRole('button', { name: `Правило 4, выход ${TARGET}` }));

    expect(screen.getAllByText(TARGET)).toHaveLength(1);
  });
});
