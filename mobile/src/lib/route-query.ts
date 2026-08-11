import { BACKEND_URL } from "@/lib/config";
import type { DisplayRouteInput, RouteInfoData } from "@/lib/types";

/**
 * Builds the route-info API URL from the fields the model relays in
 * display_route. Same rationale as buildArrivalsURL: the model only hands us
 * discrete values, never a URL it could garble.
 */
export function buildRouteInfoURL(input: DisplayRouteInput): string {
  const url = new URL("/api/route-info", BACKEND_URL);
  url.searchParams.set("route", input.route);
  if (input.operator) url.searchParams.set("operator", input.operator);
  if (input.bound) url.searchParams.set("bound", input.bound);
  return url.toString();
}

export async function fetchRouteInfo(
  input: DisplayRouteInput,
): Promise<RouteInfoData> {
  const res = await fetch(buildRouteInfoURL(input));
  if (!res.ok) {
    throw new Error(`Failed to fetch route info (${res.status})`);
  }
  const data = await res.json();
  return { route: data.route ?? input.route, routes: data.routes ?? [] };
}

/**
 * A one-line summary the model can read back, so it knows whether the card it
 * asked for actually has anything in it.
 */
export function summarizeRouteInfo(data: RouteInfoData): string {
  if (data.routes.length === 0) {
    return `No route data found for ${data.route}. Tell the user the route number may be wrong or served by an operator that is not indexed.`;
  }
  const directions = data.routes
    .map((r) => `${r.origin} → ${r.destination} (${r.stop_count} stops)`)
    .join("; ");
  return `Route card displayed to user for ${data.route}: ${directions}.`;
}
