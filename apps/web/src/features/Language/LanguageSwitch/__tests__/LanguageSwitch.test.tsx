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
  it('отмечает текущий язык', () => {
    render(<LanguageSwitch />);

    expect(screen.getByRole('button', { name: 'Русский' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Английский' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('переключает язык интерфейса и запоминает выбор', async () => {
    render(<LanguageSwitch />);

    await userEvent.click(screen.getByRole('button', { name: 'Английский' }));

    expect(i18next.language).toBe('en');
    expect(localStorage.getItem('metabox.language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('повторное нажатие не снимает выбор: без языка интерфейса нет', async () => {
    render(<LanguageSwitch />);

    const russian = screen.getByRole('button', { name: 'Русский' });

    await userEvent.click(russian);

    expect(i18next.language).toBe('ru');
    expect(russian).toHaveAttribute('aria-pressed', 'true');
  });

  it('в вертикальном виде остаётся той же именованной группой', () => {
    render(<LanguageSwitch vertical />);

    expect(screen.getByRole('group', { name: 'Язык интерфейса' })).toBeInTheDocument();
  });
});
