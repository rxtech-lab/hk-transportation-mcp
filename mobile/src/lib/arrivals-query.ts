import { BACKEND_URL } from "@/lib/config";
import type { ArrivalsQuery, DisplayArrivalsInput } from "@/lib/types";

/**
 * Builds the arrivals API URL from the structured params the model relays in
 * display_arrivals.query.
 *
 * The model used to hand us a fully-formed URL copied from the MCP response,
 * which it could garble (dropping "&" separators collapsed the query string
 * into a single unparseable `lat` value). Building it here from discrete
 * fields removes that failure mode.
 */
export function buildArrivalsURL(query: ArrivalsQuery): string {
  const { endpoint, ...params } = query;
  const url = new URL(`/api/arrivals/${endpoint}`, BACKEND_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Resolves the arrivals URL for a display_arrivals input, preferring the
 * structured query. Falls back to the legacy `url` field (rewritten onto
 * BACKEND_URL) so chat sessions persisted before the switch still refresh.
 */
export function resolveArrivalsURL(
  input: Pick<DisplayArrivalsInput, "query" | "url">,
): string | null {
  if (input.query) return buildArrivalsURL(input.query);
  if (!input.url) return null;
  try {
    const parsed = new URL(input.url);
    const backend = new URL(BACKEND_URL);
    parsed.protocol = backend.protocol;
    parsed.host = backend.host;
    return parsed.toString();
  } catch {
    return null;
  }
}
