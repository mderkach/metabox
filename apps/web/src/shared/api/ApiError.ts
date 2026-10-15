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

const UNAUTHORIZED = 401;
const SESSION_LOST_CODE = 'unauthorized';

/**
 * The daemon has a password and the request came without a live session. The code is checked
 * besides the status: the Clash API proxy passes the controller's own 401 through, and a
 * rejected sing-box secret is not a lost panel session.
 */
export function isSessionLost(error: unknown): boolean {
  return error instanceof ApiError && error.status === UNAUTHORIZED && error.code === SESSION_LOST_CODE;
}
