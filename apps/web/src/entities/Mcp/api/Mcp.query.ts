import { queryOptions, useQuery } from '@tanstack/react-query';

import { CACHE_TIME, decodeResponse } from '@shared/api';

import { getMcp } from './Mcp.api';
import { MCPSchema } from './Mcp.schema';

export const MCP_QUERY = {
  all: ['mcp'] as const,
  state: () => [...MCP_QUERY.all, 'state'] as const,
} as const;

/**
 * Whether MCP is on. Without a failure toast: an older daemon does not know the address, and
 * then the panel hides the control.
 */
export function getMcpOptions() {
  return queryOptions({
    queryKey: MCP_QUERY.state(),
    queryFn: async (context) => decodeResponse(MCPSchema, await getMcp(context), 'mcp'),
    staleTime: CACHE_TIME.Minute,
    gcTime: CACHE_TIME.Hour,
  });
}

export function useMcp() {
  return useQuery(getMcpOptions());
}
