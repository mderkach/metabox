import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionsStreamStatus } from '../ui/ConnectionsStreamStatus';

describe('ConnectionsStreamStatus', () => {
  it('живой поток не подписывает', () => {
    const { container } = render(<ConnectionsStreamStatus paused={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('на паузе говорит, что строки стоят', () => {
    render(<ConnectionsStreamStatus paused />);

    expect(screen.getByText('на паузе: строки не обновляются')).toBeInTheDocument();
  });
});
