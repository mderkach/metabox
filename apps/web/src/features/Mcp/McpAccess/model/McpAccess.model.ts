/** Name the agent gets for the server in its own config. */
export const MCP_SERVER_NAME = 'metabox';

/** The address an agent connects to: the panel origin plus the endpoint path the daemon reports. */
export function toMcpUrl(origin: string, endpoint: string): string {
  return `${origin}${endpoint}`;
}

/** Registers the server in Claude Code with the token in the `Authorization` header. */
export function toClaudeCodeCommand(url: string, token: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`;
}
