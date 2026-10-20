import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteMcpToken, getMcpOptions, MCPTokenSchema, postMcpToken } from '@entities/Mcp';
import { decodeResponse } from '@shared/api';

/**
 * Turn MCP on or replace the token. The token is in the response only: `gcTime: 0` drops the
 * mutation, and the token with it, when the dialog that issued it closes.
 */
export function useIssueMcpToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => decodeResponse(MCPTokenSchema, await postMcpToken(), 'mcp token'),
    gcTime: 0,
    meta: { showError: true, errorMessageKey: 'toast.mcp.token.failed' },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: getMcpOptions().queryKey }),
  });
}

export function useDisableMcp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => deleteMcpToken(),
    meta: {
      showError: true,
      errorMessageKey: 'toast.mcp.disable.failed',
      showSuccess: true,
      successMessageKey: 'toast.mcp.disable.done',
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: getMcpOptions().queryKey }),
  });
}
