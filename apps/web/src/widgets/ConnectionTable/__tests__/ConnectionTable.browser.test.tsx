import { renderWithQuery } from '@test/renderWithQuery';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { useConnectionView } from '../lib';
import { ConnectionTable } from '../ui';

function Toolbar() {
  const view = useConnectionView();

  return (
    <ConnectionTable.Root>
      <ConnectionTable.Toolbar view={view} />
    </ConnectionTable.Root>
  );
}

describe('connection table toolbar picked with the mouse', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('the refresh rate survives a page reload', async () => {
    const first = renderWithQuery(<Toolbar />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Частота обновления списка' }));
    await userEvent.click(await screen.findByRole('option', { name: '5 с' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('combobox', { name: 'Частота обновления списка' })).getByText('5 с')
      ).toBeVisible();
    });

    first.unmount();
    renderWithQuery(<Toolbar />);

    expect(within(screen.getByRole('combobox', { name: 'Частота обновления списка' })).getByText('5 с')).toBeVisible();
  });
});
