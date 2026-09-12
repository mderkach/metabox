import { describe, expect, it } from 'vitest';

import { API_FAILURE, ApiError } from '@shared/api';

import { toCheckFailure, toConfigVersions } from '../model/Config.adapter';

const VERSIONS_WIRE = {
  versions: [
    { id: 1, size: 2048, sum: 'a1', saved_at: 1_757_000_000 },
    { id: 3, size: 4096, sum: 'c3', saved_at: 0 },
    { id: 2, size: 3072, sum: 'b2', saved_at: 1_757_100_000 },
  ],
};

function catchApiError(run: () => unknown): ApiError | null {
  try {
    run();
  } catch (error) {
    return error instanceof ApiError ? error : null;
  }

  return null;
}

describe('toConfigVersions', () => {
  it('отдаёт историю от свежей версии к старой', () => {
    expect(toConfigVersions(VERSIONS_WIRE).map((version) => version.id)).toEqual([3, 2, 1]);
  });

  it('переводит секунды устройства в миллисекунды эпохи', () => {
    const [, , oldest] = toConfigVersions(VERSIONS_WIRE);

    expect(oldest.savedAt).toBe(1_757_000_000_000);
  });

  it('читает нулевую отметку как отсутствие времени: часы устройства не синхронизованы', () => {
    const [newest] = toConfigVersions(VERSIONS_WIRE);

    expect(newest.savedAt).toBeNull();
  });

  it('отказывает с видом `schema`, когда версия пришла без номера', () => {
    const failure = catchApiError(() => toConfigVersions({ versions: [{ size: 1, sum: 'x', saved_at: 0 }] }));

    expect(failure?.kind).toBe(API_FAILURE.Schema);
  });
});

describe('toCheckFailure', () => {
  const details = { stdout: 'ok', stderr: 'FATAL rule 3', exit_code: 1 };

  it('достаёт вывод бинаря из отказа проверки', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'check_failed', details });

    expect(toCheckFailure(error)).toEqual({ stdout: 'ok', stderr: 'FATAL rule 3', exitCode: 1 });
  });

  it('молчит, когда отказ другой: показывать нечего', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'config_missing' });

    expect(toCheckFailure(error)).toBeNull();
  });

  it('молчит, когда в отказе лежит не вывод бинаря', () => {
    const error = new ApiError(API_FAILURE.Response, 'отказ', { code: 'check_failed', details: 'просто строка' });

    expect(toCheckFailure(error)).toBeNull();
  });
});
