import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { useLiveRegion } from '../../lib/useLiveRegion';
import { LiveRegion } from '../LiveRegion';

const DONE = 'Группа proxy: выбран узел us-1';

function Harness() {
  const { message, announce } = useLiveRegion();

  return (
    <>
      <button
        type='button'
        onClick={() => {
          announce(DONE);
        }}
      >
        Объявить
      </button>
      <LiveRegion message={message} />
    </>
  );
}

describe('LiveRegion', () => {
  it('stands in the markup empty until the first announcement and politely announces text', async () => {
    const user = userEvent.setup();

    render(<Harness />);

    const region = screen.getByRole('status', { name: 'Результат действия' });

    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveTextContent(/^$/);

    await user.click(screen.getByRole('button', { name: 'Объявить' }));

    expect(region).toHaveTextContent(DONE);
  });

  it('repeating the same text replaces the node so the announcement sounds again', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Объявить' }));

    const first = screen.getByText(DONE);

    await user.click(screen.getByRole('button', { name: 'Объявить' }));

    expect(screen.getByText(DONE)).not.toBe(first);
    expect(screen.getByRole('status', { name: 'Результат действия' })).toHaveTextContent(DONE);
  });
});
