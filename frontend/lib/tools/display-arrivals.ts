import { tool } from "ai";
import { z } from "zod/v4";

const arrivalSchema = z.object({
  route: z.string(),
  destination: z.string().describe("The destination name (e.g. '銅鑼灣' or 'Causeway Bay'). Use dest_tc/dest_en from MCP data. Never use 'N/A'."),
  etas: z.array(
    z.object({
      minutes: z.number(),
      remarks: z.string().optional(),
    })
  ),
});

const stopSchema = z.object({
  id: z.string().describe("The stop_id from the MCP response. REQUIRED for real-time refresh."),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  arrivals: z.array(arrivalSchema),
});

export const displayArrivalsSchema = z.object({
  title: z.string().optional(),
  stops: z.array(stopSchema),
});

export const displayArrivalsTool = tool({
  description:
    "Display bus arrival info as a rich card and show stops on map. Call after processing MCP arrival data. You MUST include the stop_id from the MCP response as the 'id' field for each stop.",
  inputSchema: displayArrivalsSchema,
  // No execute — client-side tool
});

export type DisplayArrivalsInput = z.infer<typeof displayArrivalsSchema>;
