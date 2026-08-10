import { tool } from "ai";
import { z } from "zod/v4";
import { arrivalsQuerySchema } from "@/lib/arrivals-query";

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
  query: arrivalsQuerySchema
    .optional()
    .describe("The display_query object from the MCP tool response, copied field by field. The frontend builds the arrivals URL from it and fetches the data."),
  stops: z.array(stopSchema).optional(),
});

export const displayArrivalsTool = tool({
  description:
    "Display bus arrival info as a rich card. Pass the display_query object from the MCP tool response as the 'query' field, copying each of its fields (endpoint, lat, lon, radius, routes, dest_lat, dest_lon, ...) exactly. The frontend fetches arrival data itself. Only include 'stops' if no display_query is available.",
  inputSchema: displayArrivalsSchema,
  // No execute — client-side tool
});

export type DisplayArrivalsInput = z.infer<typeof displayArrivalsSchema>;
