import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatBytes } from '@shared/lib/format';

import { ConnectionSummaryBars, type SummaryBar } from '../ui/ConnectionSummaryBars';

function barOf(key: string, value: number): SummaryBar {
  return { key, label: key, value, caption: key, tone: 'bg-primary' };
}

describe('ConnectionSummaryBars', () => {
  it('подписывает ось делениями шкалы в единицах величины', () => {
    render(
      <ConnectionSummaryBars bars={[barOf('proxy', 3000), barOf('direct', 1000)]} empty='пусто' format={formatBytes} />
    );

    expect(screen.getByText('0 Б')).toBeInTheDocument();
    expect(screen.getByText('4.0 кБ')).toBeInTheDocument();
  });

  it('без величин не подписывает ось шкалой в один байт', () => {
    render(<ConnectionSummaryBars bars={[barOf('proxy', 0)]} empty='пусто' format={formatBytes} />);

    expect(screen.queryByText('1 Б')).not.toBeInTheDocument();
  });
});
