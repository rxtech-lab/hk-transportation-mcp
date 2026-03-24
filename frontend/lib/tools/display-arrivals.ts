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
  url: z.string().optional().describe("The display_url from the MCP tool response. Frontend fetches arrival data from this URL instead of requiring stops data."),
  stops: z.array(stopSchema).optional(),
});

export const displayArrivalsTool = tool({
  description:
    "Display bus arrival info as a rich card. Pass the display_url from the MCP tool response as the 'url' field. The frontend fetches arrival data directly from the URL. Only include 'stops' if no display_url is available.",
  inputSchema: displayArrivalsSchema,
  // No execute — client-side tool
});

export type DisplayArrivalsInput = z.infer<typeof displayArrivalsSchema>;
