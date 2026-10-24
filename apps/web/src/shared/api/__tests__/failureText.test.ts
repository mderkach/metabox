import i18next from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_FAILURE, ApiError } from '../ApiError';
import { failureText } from '../failureText';
import { showQueryError } from '../queryMeta';

vi.mock('sonner', () => ({
  toast: { error: vi.fn<(text: string) => void>(), success: vi.fn<(text: string) => void>() },
}));

const { toast } = await import('sonner');

function failure(code: string, message: string): ApiError {
  return new ApiError(API_FAILURE.Response, message, { status: 502, code });
}

afterEach(async () => {
  await i18next.changeLanguage('ru');
});

describe('failureText', () => {
  it.each([
    ['ru', 'sing-box не отвечает'],
    ['en', 'sing-box does not respond'],
  ])('translates a failure by code instead of taking the daemon message (%s)', async (language, text) => {
    await i18next.changeLanguage(language);

    expect(failureText(failure('runtime_unavailable', 'sing-box runtime unavailable'))).toBe(text);
  });

  it('stays silent about an unknown code: the panel has no translation for it', () => {
    expect(failureText(failure('quantum_flux', 'something new'))).toBeNull();
  });

  it('stays silent about an error not from the daemon', () => {
    expect(failureText(new Error('оборвалась сеть'))).toBeNull();
  });
});

describe('showQueryError', () => {
  it('shows what failed and why', () => {
    showQueryError(
      { showError: true, errorMessageKey: 'toast.proxy.delay.failed' },
      failure('runtime_unavailable', 'sing-box runtime unavailable')
    );

    expect(toast.error).toHaveBeenCalledWith('Проверить задержку не удалось: sing-box не отвечает');
  });

  it('an unknown code leaves the daemon message as fallback text', () => {
    showQueryError({ showError: true }, failure('quantum_flux', 'something new'));

    expect(toast.error).toHaveBeenCalledWith('something new');
  });
});
