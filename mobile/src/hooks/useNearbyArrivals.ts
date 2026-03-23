import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { BACKEND_URL } from "@/lib/config";
import type { StopData } from "@/lib/types";

const REFRESH_INTERVAL = 30_000;

interface NearbyResponse {
  stops: StopData[];
}

async function fetchNearbyArrivals(
  lat: number,
  lng: number,
): Promise<StopData[]> {
  const res = await fetch(`${BACKEND_URL}/api/arrivals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stops: [{ lat, lng }],
      nearbyRadius: 50,
    }),
  });
  if (!res.ok) throw new Error("Failed to fetch nearby arrivals");
  const data: NearbyResponse = await res.json();
  return data.stops ?? [];
}

export function useNearbyArrivals(lat: number | null, lng: number | null) {
  const enabled = lat != null && lng != null;

  const roundedLat = useMemo(
    () => (lat != null ? Math.round(lat * 1000) / 1000 : null),
    [lat],
  );
  const roundedLng = useMemo(
    () => (lng != null ? Math.round(lng * 1000) / 1000 : null),
    [lng],
  );

  const {
    data: stops,
    dataUpdatedAt,
    refetch,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: ["nearby-arrivals", roundedLat, roundedLng],
    queryFn: () => fetchNearbyArrivals(lat!, lng!),
    enabled,
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
  });

  return {
    stops: stops ?? [],
    isLoading,
    isRefreshing: isFetching && !isLoading,
    lastRefreshedAt: dataUpdatedAt || null,
    refetch: () => {
      refetch();
    },
  };
}
