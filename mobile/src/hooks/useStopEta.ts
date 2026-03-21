import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "@/lib/config";
import type { StopData } from "@/lib/types";

interface ArrivalsResponse {
  stops: StopData[];
}

async function fetchStopEta(
  stopId: string,
  route: string,
): Promise<StopData | null> {
  const res = await fetch(`${BACKEND_URL}/api/arrivals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stops: [{ id: stopId, routes: [route] }],
    }),
  });
  if (!res.ok) throw new Error("Failed to fetch stop ETA");
  const data: ArrivalsResponse = await res.json();
  return data.stops?.[0] ?? null;
}

export function useStopEta(
  stopId: string | null,
  route: string | null,
  enabled: boolean,
) {
  const { data, isLoading } = useQuery({
    queryKey: ["stop-eta", stopId, route],
    queryFn: () => fetchStopEta(stopId!, route!),
    enabled: enabled && stopId != null && route != null,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return {
    stopData: data ?? null,
    isLoading,
  };
}
