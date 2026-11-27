import { renderWithQuery } from '@test/renderWithQuery';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { ConfigDnsEditFallback } from '../ui/ConfigDnsEditFallback';

const TEXT = JSON.stringify({
  dns: {
    servers: [
      { type: 'local', tag: 'one' },
      { type: 'local', tag: 'two' },
      { type: 'local', tag: 'three' },
      { type: 'fallback', tag: 'parallel-chain', servers: ['two', 'one'], strategy: 'parallel' },
      { type: 'fallback', tag: 'ordered', servers: ['three', 'one'] },
    ],
  },
});

it('keeps imported parallel members readable alongside an editable sequential chain', async () => {
  const user = userEvent.setup();
  const stage = vi.fn<() => null>(() => null);
  renderWithQuery(<ConfigDnsEditFallback text={TEXT} version='1.14.3-extended-2.7.3' stale={false} stage={stage} />);
  await user.click(screen.getByText('Запасные серверы'));
  const parallel = within(await screen.findByRole('region', { name: 'parallel-chain' }));
  expect(parallel.getByText(/стратегия parallel/)).toBeVisible();
  expect(parallel.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['two', 'one']);
  expect(parallel.queryByRole('button')).not.toBeInTheDocument();
  expect(parallel.queryByRole('combobox')).not.toBeInTheDocument();
  const ordered = within(screen.getByRole('region', { name: 'ordered' }));
  expect(ordered.getByRole('combobox')).toBeEnabled();
  expect(ordered.getByRole('button', { name: 'Переместить one выше' })).toBeDisabled();
  expect(ordered.queryByRole('button', { name: /Убрать three/ })).not.toBeInTheDocument();
  expect(stage).not.toHaveBeenCalled();
});
