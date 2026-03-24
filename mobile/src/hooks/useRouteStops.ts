import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "@/lib/config";

export interface RouteStopInfo {
  id: string;
  name: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  seq: number;
}

interface RouteStopsResponse {
  route: string;
  destination: string;
  stops: RouteStopInfo[];
  matched_stop_id?: string;
}

async function fetchRouteStops(
  route: string,
  stopId: string,
): Promise<RouteStopsResponse> {
  const res = await fetch(
    `${BACKEND_URL}/api/route-stops?route=${encodeURIComponent(route)}&stopId=${encodeURIComponent(stopId)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch route stops");
  return res.json();
}

export function useRouteStops(route: string | null, stopId: string | null) {
  const enabled = route != null && stopId != null;

  const { data, isLoading } = useQuery({
    queryKey: ["route-stops", route, stopId],
    queryFn: () => fetchRouteStops(route!, stopId!),
    enabled,
    staleTime: 5 * 60_000, // route stops don't change often
  });

  return {
    route: data?.route ?? route ?? "",
    destination: data?.destination ?? "",
    stops: data?.stops ?? [],
    matchedStopId: data?.matched_stop_id ?? stopId ?? undefined,
    isLoading,
  };
}
