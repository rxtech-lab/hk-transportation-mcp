import { z } from "zod/v4";

/**
 * Structured description of an arrivals request, relayed by the model from the
 * MCP response's `display_query` field.
 *
 * The model used to copy the MCP `display_url` string verbatim, which it can
 * garble (dropping "&" separators turns the whole query string into one
 * unparseable `lat` value). Relaying discrete JSON fields removes that failure
 * mode: the client builds the URL itself, and a garbled value fails schema
 * validation instead of silently producing a 400.
 */
export const arrivalsQuerySchema = z.object({
  endpoint: z
    .enum(["nearby", "route"])
    .describe("The `endpoint` value from the MCP response's display_query."),
  lat: z.number(),
  lon: z.number(),
  radius: z.number().optional(),
  routes: z.string().optional(),
  dest_lat: z.number().optional(),
  dest_lon: z.number().optional(),
  radius_origin: z.number().optional(),
  radius_dest: z.number().optional(),
  max_transfers: z.number().int().optional(),
});

export type ArrivalsQuery = z.infer<typeof arrivalsQuerySchema>;

/** Builds the arrivals API URL from structured params. */
export function buildArrivalsURL(
  query: ArrivalsQuery,
  baseURL: string,
): string {
  const { endpoint, ...params } = query;
  const url = new URL(`/api/arrivals/${endpoint}`, baseURL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
