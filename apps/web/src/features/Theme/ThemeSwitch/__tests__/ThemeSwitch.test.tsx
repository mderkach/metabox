import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeSwitch } from '../ui/ThemeSwitch';

function renderThemeSwitch() {
  return render(
    <ThemeProvider attribute='class' defaultTheme='dark' enableSystem>
      <ThemeSwitch />
    </ThemeProvider>
  );
}

describe('ThemeSwitch', () => {
  beforeEach(() => {
    // jsdom has no `matchMedia`, and `next-themes` asks it for the system theme.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
      addListener: vi.fn<() => void>(),
      removeListener: vi.fn<() => void>(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('marks the default theme', async () => {
    renderThemeSwitch();

    expect(screen.getByRole('group', { name: 'Оформление' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Тёмная', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Как в системе' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the theme and remembers the choice', async () => {
    renderThemeSwitch();

    await userEvent.click(screen.getByRole('button', { name: 'Светлая' }));

    expect(screen.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement).toHaveClass('light');
  });

  it('a repeated press does not clear the choice: there is no "no" theme', async () => {
    renderThemeSwitch();

    const dark = await screen.findByRole('button', { name: 'Тёмная', pressed: true });

    await userEvent.click(dark);

    expect(dark).toHaveAttribute('aria-pressed', 'true');
  });
});
