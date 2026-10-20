import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useFocusReturn } from '../useFocusReturn';

function Panel({ onClose }: { onClose: () => void }) {
  const ref = useFocusReturn<HTMLHeadingElement>();

  return (
    <section>
      <h2 ref={ref} tabIndex={-1}>
        Panel
      </h2>
      <button type='button' onClick={onClose}>
        Close
      </button>
    </section>
  );
}

function Screen() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type='button'
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      {open && (
        <Panel
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

describe('useFocusReturn', () => {
  it('returns focus to the opener under Strict Mode, which runs the effect twice', async () => {
    const user = userEvent.setup();

    render(
      <StrictMode>
        <Screen />
      </StrictMode>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('heading', { name: 'Panel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});
