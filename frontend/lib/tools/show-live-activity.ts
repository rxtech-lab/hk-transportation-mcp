import { tool } from "ai";
import { z } from "zod/v4";

export const showLiveActivityTool = tool({
  description:
    "Start a Live Activity on the user's Lock Screen and Dynamic Island to track a specific bus route in real time. Call this when the user agrees to track a route after seeing arrival data.",
  inputSchema: z.object({
    route: z.string().describe("The bus route number (e.g. '6', '92')"),
    stopName: z.string().describe("The name of the bus stop"),
    stopId: z.string().describe("The stop_id for fetching live data"),
    destination: z.string().describe("The destination of this route"),
    etas: z.array(
      z.object({
        minutes: z.number(),
        remarks: z.string().optional(),
      })
    ),
  }),
  // No execute — client-side tool
});

export type ShowLiveActivityInput = z.infer<
  typeof showLiveActivityTool.inputSchema
>;
