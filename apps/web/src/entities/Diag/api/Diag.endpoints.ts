/** Dataplane diagnostics address. The daemon does not check an empty node: the `proxy` string arrives as a skip. */
export const DIAG_ENDPOINT = {
  report: () => '/api/diag',
} as const;
