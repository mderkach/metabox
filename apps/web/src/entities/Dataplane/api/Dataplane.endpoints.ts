/** Addresses of the dataplane model and its apply cycle. */
export const DATAPLANE_ENDPOINT = {
  dataplane: () => '/api/dataplane',
  applyState: (id: string) => `/api/dataplane/apply/${id}`,
  applyConfirm: (id: string) => `/api/dataplane/apply/${id}/confirm`,
} as const;
