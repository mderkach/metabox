import { z } from 'zod';

import { API_FAILURE, ApiError } from './ApiError';

/**
 * Разбор ответа схемой на границе слайса.
 *
 * Провал — отказ вида `Schema`, а не молчаливый фолбэк: там, где без данных
 * экран бессмысленен, «пусто» и «не разобрано» — разные вещи, и вторая обязана
 * быть видна. Разбор ошибки кладётся в `details` целиком: по нему видно, какое
 * поле разошлось с контрактом.
 */
export function decodeResponse<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  source: string
): z.infer<Schema> {
  const parsed = schema.safeParse(data);

  if (parsed.success) {
    return parsed.data;
  }

  throw new ApiError(API_FAILURE.Schema, `${source}: ответ не разобран`, {
    cause: parsed.error,
    details: z.prettifyError(parsed.error),
  });
}
