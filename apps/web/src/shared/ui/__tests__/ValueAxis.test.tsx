import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ValueAxis } from '../ValueAxis';

describe('ValueAxis', () => {
  it('labels every scale division', () => {
    render(<ValueAxis scale={{ ceiling: 900, ticks: [0, 300, 600, 900] }} format={(value) => `${String(value)} мс`} />);

    expect(screen.getByText('0 мс')).toBeInTheDocument();
    expect(screen.getByText('900 мс')).toBeInTheDocument();
  });
});
