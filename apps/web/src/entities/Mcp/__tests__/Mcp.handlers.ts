import { http, HttpResponse } from 'msw';

import { MCP_ENDPOINT } from '../api/Mcp.endpoints';

export const MCP_TOKEN_FIXTURE = ['mbx_first', 'mbx_second', 'mbx_third'] as const;

/**
 * The daemon's MCP switch: off until a token is issued, every issue replaces the previous
 * token. Without arguments MCP is off, as on a fresh install.
 */
export function createMcpHandlers({ enabled = false }: { enabled?: boolean } = {}) {
  const state = { enabled, issued: 0 };

  return [
    http.get(MCP_ENDPOINT.state(), () =>
      HttpResponse.json({ enabled: state.enabled, endpoint: '/mcp', permissions: state.enabled ? ['read'] : [] })
    ),
    http.post(MCP_ENDPOINT.token(), () => {
      const token = MCP_TOKEN_FIXTURE[state.issued % MCP_TOKEN_FIXTURE.length];

      state.issued += 1;
      state.enabled = true;

      return HttpResponse.json({ token, endpoint: '/mcp', permissions: ['read'] });
    }),
    http.delete(MCP_ENDPOINT.token(), () => {
      state.enabled = false;

      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
