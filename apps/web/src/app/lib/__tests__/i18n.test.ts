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
    await preloadNamespaces('shared');

    expect(requested).toHaveBeenCalledOnce();
    expect(i18next.t('action.done', { ns: 'shared' })).toBe('Loaded from HTTP');
  });
});
