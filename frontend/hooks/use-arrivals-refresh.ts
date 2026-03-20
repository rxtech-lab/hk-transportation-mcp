"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useMemo } from "react";
import type { DisplayArrivalsInput } from "@/lib/tools/display-arrivals";
import { BACKEND_URL } from "@/lib/config";

const REFRESH_INTERVAL = 30_000;

async function fetchArrivals(
  stops: { id?: string; lat: number; lng: number }[],
): Promise<DisplayArrivalsInput["stops"]> {
  const res = await fetch(`${BACKEND_URL}/api/arrivals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stops }),
  });
  if (!res.ok) throw new Error("Failed to fetch arrivals");
  const data = await res.json();
  return data.stops ?? [];
}

export function useArrivalsRefresh(
  arrivalsData: DisplayArrivalsInput | null,
  setArrivalsData: (data: DisplayArrivalsInput | null) => void,
) {
  const stops = arrivalsData?.stops;
  const hasStops = !!stops?.length;

  const queryStops = useMemo(
    () =>
      hasStops
        ? stops
            .filter(
              (s) => typeof s.lat === "number" && typeof s.lng === "number",
            )
            .map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }))
        : [],
    [hasStops, stops],
  );

  // Stable key based on stop IDs
  const queryKeyStops = useMemo(
    () => queryStops.map((s) => s.id ?? `${s.lat},${s.lng}`).join("|"),
    [queryStops],
  );

  // Keep a ref so queryFn always reads the latest stops
  const queryStopsRef = useRef(queryStops);
  useEffect(() => {
    queryStopsRef.current = queryStops;
  }, [queryStops]);

  const {
    data: freshStops,
    dataUpdatedAt,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["arrivals", queryKeyStops],
    queryFn: () => fetchArrivals(queryStopsRef.current),
    enabled: hasStops,
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Merge fresh ETAs into existing arrivals data, preserving original destination names
  useEffect(() => {
    if (!freshStops?.length || !arrivalsData?.stops?.length) return;

    const freshMap = new Map<string, (typeof freshStops)[0]>();
    for (const s of freshStops) {
      const key = s.id || `${s.lat},${s.lng}`;
      freshMap.set(key, s);
    }

    let changed = false;
    const updatedStops = arrivalsData.stops.map((stop) => {
      const key = stop.id || `${stop.lat},${stop.lng}`;
      const fresh = freshMap.get(key);
      if (!fresh?.arrivals?.length) return stop;

      const freshByRoute = new Map<string, (typeof fresh.arrivals)[0]>();
      for (const a of fresh.arrivals) {
        freshByRoute.set(a.route, a);
      }

      const updatedArrivals = stop.arrivals.map((arrival) => {
        const freshArrival = freshByRoute.get(arrival.route);
        if (freshArrival) {
          changed = true;
          return { ...arrival, etas: freshArrival.etas };
        }
        return arrival;
      });

      return { ...stop, id: fresh.id || stop.id, arrivals: updatedArrivals };
    });

    if (changed) {
      setArrivalsData({ ...arrivalsData, stops: updatedStops });
    }
  }, [freshStops]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    lastRefreshedAt: dataUpdatedAt || null,
    refetch: () => {
      refetch();
    },
    isRefreshing: isFetching,
  };
}
