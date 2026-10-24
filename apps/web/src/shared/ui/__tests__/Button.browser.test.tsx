import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { Button } from '../Button';

describe('Button in a real browser', () => {
  it('lays out with the panel styles and takes a mouse click', async () => {
    const onClick = vi.fn<() => void>();

    render(<Button onClick={onClick}>Go</Button>);

    const button = screen.getByRole('button', { name: 'Go' });

    // jsdom has no layout and reports zero sizes: a non-zero height proves the styles applied.
    expect(button.getBoundingClientRect().height).toBeGreaterThan(0);

    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });
});
