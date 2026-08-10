import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useMemo } from "react";
import { BACKEND_URL } from "@/lib/config";
import { resolveArrivalsURL } from "@/lib/arrivals-query";
import type { DisplayArrivalsInput, StopData } from "@/lib/types";
import { updateWidget } from "@/lib/widget";

const REFRESH_INTERVAL = 30_000;

async function fetchArrivals(
  stops: { id?: string; lat: number; lng: number }[],
): Promise<StopData[]> {
  const res = await fetch(`${BACKEND_URL}/api/arrivals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stops }),
  });
  if (!res.ok) throw new Error("Failed to fetch arrivals");
  const data = await res.json();
  return data.stops ?? [];
}

async function fetchArrivalsFromURL(url: string): Promise<StopData[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch arrivals (${res.status})`);
  const data = await res.json();
  return data.stops ?? [];
}

export function useArrivalsRefresh(
  arrivalsData: DisplayArrivalsInput | null,
  setArrivalsData: (data: DisplayArrivalsInput | null) => void,
) {
  const stops = arrivalsData?.stops;
  const hasStops = !!stops?.length;
  const refreshURL = arrivalsData ? resolveArrivalsURL(arrivalsData) : null;

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

  const queryKeyStops = useMemo(
    () => queryStops.map((s) => s.id ?? `${s.lat},${s.lng}`).join("|"),
    [queryStops],
  );

  const queryStopsRef = useRef(queryStops);
  queryStopsRef.current = queryStops;
  const refreshURLRef = useRef(refreshURL);
  refreshURLRef.current = refreshURL;

  const enabled = hasStops || !!refreshURL;
  const queryKey = refreshURL
    ? ["arrivals-url", refreshURL]
    : ["arrivals", queryKeyStops];

  const {
    data: freshStops,
    dataUpdatedAt,
    refetch,
    isFetching,
  } = useQuery({
    queryKey,
    queryFn: () =>
      refreshURLRef.current
        ? fetchArrivalsFromURL(refreshURLRef.current)
        : fetchArrivals(queryStopsRef.current),
    enabled,
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!freshStops?.length || !arrivalsData) return;

    if (refreshURLRef.current) {
      // URL-based: replace stops entirely with fresh data
      const updated: DisplayArrivalsInput = {
        ...arrivalsData,
        stops: freshStops,
      };
      setArrivalsData(updated);
      updateWidget(updated);
      return;
    }

    // Legacy: merge fresh ETAs into existing stops
    if (!arrivalsData.stops?.length) return;

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
      const updated = { ...arrivalsData, stops: updatedStops };
      setArrivalsData(updated);
      updateWidget(updated);
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
