import { z } from 'zod';

export const METADATA_LABEL_LIMIT = 64;
const MAX_NORM_MS = 10_000;

export const METADATA_FORM_ERROR = {
  LabelTooLong: 'labelTooLong',
  ControlChars: 'controlChars',
  InvalidNorm: 'invalidNorm',
} as const;

export const ProxyMetadataFormSchema = z.object({
  /** Optional display name stored separately from the config tag. */
  label: z
    .string()
    .refine((label) => !/\p{Cc}/u.test(label), METADATA_FORM_ERROR.ControlChars)
    .refine((label) => Array.from(label).length <= METADATA_LABEL_LIMIT, METADATA_FORM_ERROR.LabelTooLong),
  /** Blank restores the usual latency derived from history. */
  norm: z.string().refine((norm) => {
    if (norm === '') return true;
    const value = Number(norm);

    return /^\d+$/.test(norm) && value >= 1 && value <= MAX_NORM_MS;
  }, METADATA_FORM_ERROR.InvalidNorm),
});

export type ProxyMetadataFormModel = z.infer<typeof ProxyMetadataFormSchema>;
