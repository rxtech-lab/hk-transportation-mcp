import { BACKEND_URL } from "@/lib/config";
import type { DisplayRouteInput } from "@/lib/tools/display-route";

export interface RouteStopPoint {
  id: string;
  name: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  seq: number;
}

/** One direction/service-type variant of a route, as returned by /api/route-info. */
export interface RouteVariant {
  route_id: string;
  route: string;
  bound: string;
  service_type: string;
  operator: string;
  /** First stop of this variant's ordered stop list. */
  origin: string;
  origin_tc?: string;
  origin_sc?: string;
  /** Last stop of this variant's ordered stop list. */
  destination: string;
  destination_tc?: string;
  destination_sc?: string;
  /** The operator's published labels — may describe the opposite direction. */
  published_origin?: string;
  published_destination?: string;
  stop_count: number;
  stops: RouteStopPoint[];
}

export interface RouteInfoData {
  route: string;
  routes: RouteVariant[];
}

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

/**
 * Picks the variant a card should show: the one matching the requested bound,
 * else the first one the backend returned.
 */
export function pickVariant(
  data: RouteInfoData,
  bound?: string,
): RouteVariant | undefined {
  if (bound) {
    const match = data.routes.find(
      (r) => r.bound.toUpperCase() === bound.toUpperCase(),
    );
    if (match) return match;
  }
  return data.routes[0];
}
