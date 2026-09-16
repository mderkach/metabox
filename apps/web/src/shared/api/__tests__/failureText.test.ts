import { describe, expect, it, vi } from 'vitest';

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

describe('failureText', () => {
  it('переводит отказ по коду, а не берёт сообщение демона', () => {
    expect(failureText(failure('runtime_unavailable', 'рантайм sing-box недоступен'))).toBe(
      'рантайм sing-box не отвечает'
    );
  });

  it('молчит о незнакомом коде: перевода у панели для него нет', () => {
    expect(failureText(failure('quantum_flux', 'что-то новое'))).toBeNull();
  });

  it('молчит об ошибке не от демона', () => {
    expect(failureText(new Error('оборвалась сеть'))).toBeNull();
  });
});

describe('showQueryError', () => {
  it('показывает, что не вышло и почему', () => {
    showQueryError(
      { showError: true, errorMessageKey: 'toast.proxy.delay.failed' },
      failure('runtime_unavailable', 'рантайм sing-box недоступен')
    );

    expect(toast.error).toHaveBeenCalledWith('Проверить задержку не удалось: рантайм sing-box не отвечает');
  });

  it('незнакомый код оставляет сообщение демона запасным текстом', () => {
    showQueryError({ showError: true }, failure('quantum_flux', 'что-то новое'));

    expect(toast.error).toHaveBeenCalledWith('что-то новое');
  });
});
