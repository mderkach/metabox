import type { AxiosRequestConfig } from 'axios';

import { ApiClientInstance } from '@shared/api';

import { MCP_ENDPOINT } from './Mcp.endpoints';
import type { MCPTokenWire, MCPWire } from './Mcp.schema';

export async function getMcp(config?: AxiosRequestConfig): Promise<MCPWire> {
  return ApiClientInstance.get<MCPWire>(MCP_ENDPOINT.state(), config);
}

/** Enables MCP and replaces the token: the previous one stops working. */
export async function postMcpToken(config?: AxiosRequestConfig): Promise<MCPTokenWire> {
  return ApiClientInstance.post<MCPTokenWire>(MCP_ENDPOINT.token(), undefined, config);
}

export async function deleteMcpToken(config?: AxiosRequestConfig): Promise<void> {
  await ApiClientInstance.delete(MCP_ENDPOINT.token(), config);
}
