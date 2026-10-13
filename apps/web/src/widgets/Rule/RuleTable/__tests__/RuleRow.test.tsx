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

/** Text width in jsdom is zero, so truncation is imitated by text wider than the cell. */
const CUT_WIDTH = 400;

/** Longer than the delay with which the tooltip opens on hover. */
const HINT_WAIT_MS = 1000;

/**
 * Mouse hover waiting out the tooltip delay. The clock is fake, but also runs
 * by itself: Testing Library waits for a real `setTimeout(0)` after every action,
 * and on a stopped clock `user-event` hangs.
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

  it('the select button names the row by number and outbound', () => {
    renderRow();

    expect(screen.getByRole('button', { name: `Правило 4, выход ${TARGET}` })).toBeInTheDocument();
  });

  // The button covers the row, and the outbound `title` under it was not shown.
  it('shows a truncated outbound in full as a tooltip on hovering the row', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(CUT_WIDTH);

    renderRow();
    await hover(screen.getByRole('button', { name: `Правило 4, выход ${TARGET}` }));

    expect(screen.getAllByText(TARGET)).toHaveLength(2);
  });

  it('without truncation does not show the tooltip', async () => {
    renderRow();
    await hover(screen.getByRole('button', { name: `Правило 4, выход ${TARGET}` }));

    expect(screen.getAllByText(TARGET)).toHaveLength(1);
  });
});
