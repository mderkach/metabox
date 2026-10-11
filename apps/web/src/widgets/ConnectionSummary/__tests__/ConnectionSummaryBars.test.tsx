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

  // Длина столбца и ось — объём, поэтому подпись строки начинается с него, а
  // скорость или число соединений идут после.
  it('начинает подпись строки с величины шкалы и её доли', () => {
    render(
      <ConnectionSummaryBars
        bars={[{ key: 'proxy', label: 'через прокси', value: 3072, caption: '2 соединения', tone: 'bg-primary' }]}
        empty='пусто'
        format={formatBytes}
      />
    );

    expect(screen.getByText('3.0 кБ · 100% · 2 соединения')).toBeInTheDocument();
  });

  it('без строк показывает подпись пустого ряда вместо шкалы', () => {
    render(<ConnectionSummaryBars bars={[]} empty='пусто' format={formatBytes} />);

    expect(screen.getByText('пусто')).toBeInTheDocument();
    expect(screen.queryByText('0 Б')).not.toBeInTheDocument();
  });

  it('держит место под пропавшие строки, чтобы карточка не прыгала по высоте', () => {
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

  it('не сжимает шкалу вслед за небольшим спадом величины', () => {
    const { rerender } = render(
      <ConnectionSummaryBars bars={[barOf('proxy', 3000)]} empty='пусто' format={formatBytes} />
    );

    rerender(<ConnectionSummaryBars bars={[barOf('proxy', 1500)]} empty='пусто' format={formatBytes} />);

    expect(screen.getByText('4.0 кБ')).toBeInTheDocument();
  });

  it('без величин не подписывает ось шкалой в один байт', () => {
    render(<ConnectionSummaryBars bars={[barOf('proxy', 0)]} empty='пусто' format={formatBytes} />);

    expect(screen.queryByText('1 Б')).not.toBeInTheDocument();
  });
});
