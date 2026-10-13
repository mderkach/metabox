import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18next from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageSwitch } from '../ui/LanguageSwitch';

afterEach(async () => {
  await i18next.changeLanguage('ru');
  localStorage.clear();
});

describe('LanguageSwitch', () => {
  it('marks the current language', () => {
    render(<LanguageSwitch />);

    expect(screen.getByRole('button', { name: 'Русский' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Английский' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the interface language and remembers the choice', async () => {
    render(<LanguageSwitch />);

    await userEvent.click(screen.getByRole('button', { name: 'Английский' }));

    expect(i18next.language).toBe('en');
    expect(localStorage.getItem('metabox.language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a repeated press does not clear the choice: there is no interface without a language', async () => {
    render(<LanguageSwitch />);

    const russian = screen.getByRole('button', { name: 'Русский' });

    await userEvent.click(russian);

    expect(i18next.language).toBe('ru');
    expect(russian).toHaveAttribute('aria-pressed', 'true');
  });

  it('in vertical layout stays the same named group', () => {
    render(<LanguageSwitch vertical />);

    expect(screen.getByRole('group', { name: 'Язык интерфейса' })).toBeInTheDocument();
  });
});
