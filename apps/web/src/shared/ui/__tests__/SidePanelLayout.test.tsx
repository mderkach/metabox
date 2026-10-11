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

  it('открывает панель рядом со списком и отдаёт ей фокус', async () => {
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));

    expect(screen.getByRole('heading', { name: 'Правило 1' })).toHaveFocus();
    expect(screen.getByRole('complementary', { name: 'Правило 1' })).toBeInTheDocument();
  });

  it('закрытая панель уходит из дерева доступности сразу, а содержимое держит до конца сворачивания', async () => {
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

  it('смена содержимого открытой панели не закрывает её', async () => {
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));
    await user.click(screen.getByRole('button', { name: 'Открыть второе' }));

    expect(screen.getByRole('complementary', { name: 'Правило 2' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Правило 1', hidden: true })).not.toBeInTheDocument();
  });

  it('сворачивает колонку и без конца перехода: прерванный выезд её не держит', () => {
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

  it('без анимации снимает содержимое сразу: конца перехода не будет', async () => {
    stubReducedMotion();
    const user = userEvent.setup();

    render(<Screen />);
    await user.click(screen.getByRole('button', { name: 'Открыть первое' }));
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('complementary', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть первое' })).toHaveFocus();
  });
});
