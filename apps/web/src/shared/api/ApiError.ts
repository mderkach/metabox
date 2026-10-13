/** Daemon unavailability disables the panel, while its error response disables only the screen. */
export const API_FAILURE = {
  Unreachable: 'unreachable',
  Response: 'response',
  /**
   * The response arrived but the schema did not accept it. Born not in the transport but in the
   * option factory, so it has none of the transport's `status`, `code` and `details`:
   * `details` holds the schema error breakdown.
   */
  Schema: 'schema',
} as const;

export type ApiFailure = (typeof API_FAILURE)[keyof typeof API_FAILURE];

/** `details` of `check_failed` carries the verbatim sing-box output. */
export class ApiError extends Error {
  readonly kind: ApiFailure;
  readonly status: number | null;
  readonly code: string | null;
  readonly details: unknown;

  constructor(
    kind: ApiFailure,
    message: string,
    extra?: {
      status?: number;
      code?: string;
      details?: unknown;
      cause?: unknown;
    }
  ) {
    super(message, { cause: extra?.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = extra?.status ?? null;
    this.code = extra?.code ?? null;
    this.details = extra?.details;
  }
}
