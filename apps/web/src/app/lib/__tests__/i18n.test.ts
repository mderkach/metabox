import { SHARED_NS } from '@shared/i18n';
vi.mock('i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('i18next')>();

  return { ...actual, default: actual.createInstance() };
});

import { server } from '@test/server';
import i18next from 'i18next';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { initI18n, preloadNamespaces } from '../i18n';

afterEach(() => {
  localStorage.removeItem('metabox.language');
  vi.restoreAllMocks();
});

describe('language on start', () => {
  it('on the first visit takes the browser language, not the fallback', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'ru']);

    await initI18n();

    expect(i18next.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('a saved choice wins over the browser language', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    localStorage.setItem('metabox.language', 'ru');

    await initI18n();

    expect(i18next.language).toBe('ru');
    expect(document.documentElement.lang).toBe('ru');
  });
});

describe('production locale backend', () => {
  it('loads a namespace from the virtual URL map over HTTP', async () => {
    const requested = vi.fn<() => void>();

    server.use(
      http.get('/locales/shared/ru.json', () => {
        requested();

        return HttpResponse.json({ action: { done: 'Loaded from HTTP' } });
      })
    );
    localStorage.setItem('metabox.language', 'ru');
    await initI18n();
    await preloadNamespaces(SHARED_NS);

    expect(requested).toHaveBeenCalledOnce();
    expect(i18next.t('action.done', { ns: SHARED_NS })).toBe('Loaded from HTTP');
  });
});
