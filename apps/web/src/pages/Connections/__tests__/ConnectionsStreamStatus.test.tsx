import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MS_IN_SECOND } from '@shared/lib/time';

import { useStreamStale } from '../lib';
import { ConnectionsStreamStatus } from '../ui/ConnectionsStreamStatus';

describe('ConnectionsStreamStatus', () => {
  it('a live stream is not labeled', () => {
    const { container } = render(<ConnectionsStreamStatus paused={false} stale={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('on pause says the rows are standing still', () => {
    render(<ConnectionsStreamStatus paused stale={false} />);

    expect(screen.getByText('на паузе: строки не обновляются')).toBeInTheDocument();
  });

  it('names a dropped stream so the last speeds do not read as live', () => {
    render(<ConnectionsStreamStatus paused={false} stale />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'обновлений с роутера нет: строки и скорости — из последнего снимка'
    );
  });
});

describe('useStreamStale', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns stale once snapshots stop, and not before the first one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100 * MS_IN_SECOND);

    const { result, rerender } = renderHook(({ at }: { at: number | null }) => useStreamStale(at), {
      initialProps: { at: null as number | null },
    });

    expect(result.current).toBe(false);

    rerender({ at: 100 * MS_IN_SECOND });

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(9 * MS_IN_SECOND);
    });

    expect(result.current).toBe(true);
  });
});
