import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionsStreamStatus } from '../ui/ConnectionsStreamStatus';

describe('ConnectionsStreamStatus', () => {
  it('a live stream is not labeled', () => {
    const { container } = render(<ConnectionsStreamStatus paused={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('on pause says the rows are standing still', () => {
    render(<ConnectionsStreamStatus paused />);

    expect(screen.getByText('на паузе: строки не обновляются')).toBeInTheDocument();
  });
});
