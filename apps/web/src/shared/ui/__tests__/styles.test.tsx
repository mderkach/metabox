import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from '../shadcn/card';
import { SURFACE } from '../styles';

// `SURFACE` repeats the `Card` edge verbatim, and the vendor file is overwritten by the CLI:
// a shadcn update that changed the card edge would silently diverge it from the panels.
describe('SURFACE', () => {
  it('repeats the vendor card edge', () => {
    render(<Card data-testid='card' />);

    const card = screen.getByTestId('card');

    for (const name of SURFACE.split(' ')) {
      expect(card).toHaveClass(name);
    }
  });
});
