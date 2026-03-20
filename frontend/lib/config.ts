export const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/mcp";
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? MCP_URL.replace(/\/mcp\/?$/, "");
export const AI_MODEL =
  process.env.AI_MODEL ?? "google/gemini-3.1-flash-lite-preview";
export const AI_GATEWAY_URL =
  process.env.AI_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/v1";
export const AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY ?? "";
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
export const MCP_ADMIN_KEY = process.env.MCP_ADMIN_KEY ?? "";
export const KV_REST_API_URL = process.env.KV_REST_API_URL ?? "";
export const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN ?? "";
