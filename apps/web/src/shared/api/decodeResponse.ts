import i18next from 'i18next';
import { z } from 'zod';

import { API_FAILURE, ApiError } from './ApiError';

/**
 * Провал разбора — отказ вида `Schema`, а не пустая модель: «данных нет» и
 * «ответ не разобран» — разные вещи. Разбор ошибки уходит в `details`.
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

  throw new ApiError(API_FAILURE.Schema, i18next.t('response.unparsed', { ns: 'shared', source }), {
    cause: parsed.error,
    details: z.prettifyError(parsed.error),
  });
}

/**
 * `null` — кадр отбракован: следующий придёт через секунду, ронять подписку
 * незачем. Отбраковка пишется в лог: иначе экран замирает без признака поломки.
 */
export function decodeFrame<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  topic: string
): z.infer<Schema> | null {
  const parsed = schema.safeParse(data);

  if (parsed.success) {
    return parsed.data;
  }

  console.warn(`[STREAM] кадр топика ${topic} отбракован`, z.prettifyError(parsed.error));

  return null;
}
