import { tool } from "ai";
import { z } from "zod/v4";

export const displayRouteSchema = z.object({
  route: z
    .string()
    .describe("The bus route number exactly as the operator publishes it, e.g. 'A11', '968', 'N969'."),
  operator: z
    .enum(["KMB", "CTB", "GMB"])
    .optional()
    .describe("Operator code, when known from the search_route response. Omit to show every operator running this number."),
  bound: z
    .string()
    .optional()
    .describe("Direction to preselect: 'O' (outbound) or 'I' (inbound). Omit to let the user pick."),
});

export const displayRouteTool = tool({
  description:
    "Display a bus route as a rich card with its full ordered stop list and a map line. Call this whenever the user asks about a route itself (e.g. 'A11 route', 'where does the 968 go?'). Pass only the route number plus the operator/bound you learned from search_route — the frontend fetches the stops itself, so never pass stop data. The card renders its own heading from that data, so there is nothing else to supply.",
  inputSchema: displayRouteSchema,
  // No execute — client-side tool
});

export type DisplayRouteInput = z.infer<typeof displayRouteSchema>;
