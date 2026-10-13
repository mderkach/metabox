import i18next from 'i18next';
import { z } from 'zod';

import { API_FAILURE, ApiError } from './ApiError';

/**
 * A parse failure is a `Schema` refusal, not an empty model: "no data" and
 * "response not parsed" are different things. The error breakdown goes to `details`.
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
 * `null` means the frame is discarded: the next one comes in a second, there is no
 * reason to drop the subscription. Discarding is logged: otherwise the screen freezes with no sign of breakage.
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

  console.warn(`[STREAM] frame of topic ${topic} discarded`, z.prettifyError(parsed.error));

  return null;
}
