import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatBytes } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from '../ui/ConnectionSummaryBars';

function barOf(key: string, value: number): SummaryBar {
  return { key, label: key, value, caption: key, tone: 'bg-primary' };
}

describe('ConnectionSummaryBars', () => {
  it('labels the axis with scale divisions in value units', () => {
    render(
      <ConnectionSummaryBars bars={[barOf('proxy', 3000), barOf('direct', 1000)]} empty='пусто' format={formatBytes} />
    );

    expect(screen.getByText('0 Б')).toBeInTheDocument();
    expect(screen.getByText('4.0 кБ')).toBeInTheDocument();
  });

  // The bar length and axis are volume, so the row label starts with it, and
  // speed or connection count come after.
  it('starts the row label with the scale value and its share', () => {
    render(
      <ConnectionSummaryBars
        bars={[{ key: 'proxy', label: 'через прокси', value: 3072, caption: '2 соединения', tone: 'bg-primary' }]}
        empty='пусто'
        format={formatBytes}
      />
    );

    expect(screen.getByText('3.0 кБ · 100% · 2 соединения')).toBeInTheDocument();
  });

  it('without rows shows an empty row label instead of the scale', () => {
    render(<ConnectionSummaryBars bars={[]} empty='пусто' format={formatBytes} />);

    expect(screen.getByText('пусто')).toBeInTheDocument();
    expect(screen.queryByText('0 Б')).not.toBeInTheDocument();
  });

  it('keeps space for vanished rows so the card does not jump in height', () => {
    const { rerender } = render(
      <ConnectionSummaryBars
        bars={[barOf('proxy', 3000), barOf('direct', 1000), barOf('block', 500)]}
        empty='пусто'
        format={formatBytes}
      />
    );

    rerender(<ConnectionSummaryBars bars={[barOf('proxy', 3000)]} empty='пусто' format={formatBytes} />);

    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(3);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('does not shrink the scale after a small dip in the value', () => {
    const { rerender } = render(
      <ConnectionSummaryBars bars={[barOf('proxy', 3000)]} empty='пусто' format={formatBytes} />
    );

    rerender(<ConnectionSummaryBars bars={[barOf('proxy', 1500)]} empty='пусто' format={formatBytes} />);

    expect(screen.getByText('4.0 кБ')).toBeInTheDocument();
  });

  it('without values does not label the axis with a one-byte scale', () => {
    render(<ConnectionSummaryBars bars={[barOf('proxy', 0)]} empty='пусто' format={formatBytes} />);

    expect(screen.queryByText('1 Б')).not.toBeInTheDocument();
  });
});
