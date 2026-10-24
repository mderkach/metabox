import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from '../Button';
import { buttonVariants } from '../Button.lib';

describe('Button', () => {
  it('sets the small size text on an even step of the type scale', () => {
    render(<Button size='sm'>Go</Button>);

    const button = screen.getByRole('button', { name: 'Go' });

    expect(button).toHaveClass('text-xs');
    expect(button).not.toHaveClass('text-[0.8rem]');
  });

  it('leaves the other sizes to the primitive', () => {
    render(<Button>Go</Button>);

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-sm');
  });

  it('keeps the class passed by the caller', () => {
    render(
      <Button size='sm' className='font-mono'>
        Go
      </Button>
    );

    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('text-xs', 'font-mono');
  });
});

describe('buttonVariants', () => {
  it('gives a link styled as a small button the same text size', () => {
    const classes = buttonVariants({ variant: 'outline', size: 'sm' }).split(' ');

    expect(classes).toContain('text-xs');
    expect(classes).not.toContain('text-[0.8rem]');
  });
});
