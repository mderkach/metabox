import { finishSidePanelTransition } from '@test/sidePanel';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MS_IN_SECOND } from '../../lib/time';
import { useFocusReturn } from '../../lib/useFocusReturn';
import * as SidePanelLayout from '../SidePanelLayout';

function Panel({ name, onClose }: { name: string; onClose: () => void }) {
  const headingRef = useFocusReturn<HTMLHeadingElement>();

  return (
    <aside aria-label={name}>
      <h2 ref={headingRef} tabIndex={-1}>
        {name}
      </h2>
      <button type='button' onClick={onClose}>
        Закрыть
      </button>
    </aside>
  );
}

function Screen() {
  const [selected, setSelected] = useState<string | null>(null);

  function close() {
    setSelected(null);
  }

  return (
    <SidePanelLayout.Root open={selected !== null}>
      <SidePanelLayout.Main>
        <button
          type='button'
          onClick={() => {
            setSelected('Правило 1');
          }}
        >
          Открыть первое
        </button>
        <button
          type='button'
          onClick={() => {
            setSelected('Правило 2');
          }}
        >
          Открыть второе
        </button>
      </SidePanelLayout.Main>
      <SidePanelLayout.Panel>
        {selected !== null && <Panel key={selected} name={selected} onClose={close} />}
      </SidePanelLayout.Panel>
    </SidePanelLayout.Root>
  );
}

function stubReducedMotion() {
  vi.stubGlobal('matchMedia', function matchReducedMotion(media: string) {
    return {
      matches: media === '(prefers-reduced-motion: reduce)',
      media,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    };
  });
}

describe('SidePanelLayout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the panel next to the list and gives it focus', async () => {
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));

    expect(screen.getByRole('heading', { name: 'Правило 1' })).toHaveFocus();
    expect(screen.getByRole('complementary', { name: 'Правило 1' })).toBeInTheDocument();
  });

  it('a closed panel leaves the accessibility tree at once, and the content stays until the collapse ends', async () => {
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Правило 1', hidden: true })).toBeInTheDocument();

    finishSidePanelTransition();

    expect(screen.queryByRole('complementary', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть первое' })).toHaveFocus();
  });

  it('changing the content of an open panel does not close it', async () => {
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));
    await user.click(screen.getByRole('button', { name: 'Открыть второе' }));

    expect(screen.getByRole('complementary', { name: 'Правило 2' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Правило 1', hidden: true })).not.toBeInTheDocument();
  });

  it('collapses the column even without the transition end: an interrupted slide-out does not hold it', () => {
    vi.useFakeTimers();

    function Layout({ open }: { open: boolean }) {
      return (
        <SidePanelLayout.Root open={open}>
          <SidePanelLayout.Main>список</SidePanelLayout.Main>
          <SidePanelLayout.Panel>{open && <aside aria-label='Правило 1' />}</SidePanelLayout.Panel>
        </SidePanelLayout.Root>
      );
    }

    const view = render(<Layout open />);

    view.rerender(<Layout open={false} />);
    expect(screen.getByRole('complementary', { name: 'Правило 1', hidden: true })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(MS_IN_SECOND);
    });

    expect(screen.queryByRole('complementary', { hidden: true })).not.toBeInTheDocument();
  });

  it('without animation removes the content at once: there will be no transition end', async () => {
    stubReducedMotion();
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('complementary', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть первое' })).toHaveFocus();
  });
});
