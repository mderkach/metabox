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
    // `matchMedia` в jsdom нет, а `next-themes` спрашивает у него системную тему.
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

  it('отмечает тему по умолчанию', async () => {
    renderThemeSwitch();

    expect(screen.getByRole('group', { name: 'Оформление' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Тёмная', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Как в системе' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('переключает тему и запоминает выбор', async () => {
    renderThemeSwitch();

    await userEvent.click(screen.getByRole('button', { name: 'Светлая' }));

    expect(screen.getByRole('button', { name: 'Светлая' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Тёмная' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement).toHaveClass('light');
  });

  it('повторное нажатие не снимает выбор: темы «никакой» нет', async () => {
    renderThemeSwitch();

    const dark = await screen.findByRole('button', { name: 'Тёмная', pressed: true });

    await userEvent.click(dark);

    expect(dark).toHaveAttribute('aria-pressed', 'true');
  });
});
