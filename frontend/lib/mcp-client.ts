import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { MCP_URL, MCP_ADMIN_KEY } from "@/lib/config";

// Reuse a single MCP client across requests to avoid repeated initialize handshakes
let mcpClientPromise: Promise<MCPClient> | null = null;

export function getMCPClient(): Promise<MCPClient> {
  if (!mcpClientPromise) {
    mcpClientPromise = createMCPClient({
      transport: {
        type: "http",
        url: MCP_URL,
        headers: MCP_ADMIN_KEY
          ? { "X-Authenticated-Subject": MCP_ADMIN_KEY }
          : undefined,
      },
    }).catch((err) => {
      mcpClientPromise = null;
      throw err;
    });
  }
  return mcpClientPromise;
}

export function resetMCPClient() {
  mcpClientPromise = null;
}
