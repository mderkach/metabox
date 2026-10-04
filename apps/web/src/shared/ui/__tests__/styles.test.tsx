import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from '../shadcn/card';
import { SURFACE } from '../styles';

// `SURFACE` повторяет край `Card` дословно, а файл вендора перезаписывает CLI:
// обновление shadcn, сменившее край карточки, развело бы её с панелями молча.
describe('SURFACE', () => {
  it('повторяет край карточки вендора', () => {
    render(<Card data-testid='card' />);

    const card = screen.getByTestId('card');

    for (const name of SURFACE.split(' ')) {
      expect(card).toHaveClass(name);
    }
  });
});
