import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionsStreamStatus } from '../ui/ConnectionsStreamStatus';

describe('ConnectionsStreamStatus', () => {
  it('называет выбранный интервал с согласованным числительным', () => {
    render(<ConnectionsStreamStatus paused={false} interval={5000} />);

    expect(screen.getByText('обновляется каждые 5 секунд')).toBeInTheDocument();
  });

  it('на паузе говорит о паузе, а не об интервале', () => {
    render(<ConnectionsStreamStatus paused interval={15_000} />);

    expect(screen.getByText('на паузе: строки не обновляются')).toBeInTheDocument();
  });
});
