"use client";

import { IconMapPin, IconBus, IconRefresh } from "@tabler/icons-react";
import type { DisplayArrivalsInput } from "@/lib/tools/display-arrivals";
import type { LocationPin } from "@/components/chat-messages";

function etaColor(minutes: number): string {
  if (minutes <= 0) return "bg-red-500/15 text-red-400";
  if (minutes <= 5) return "bg-emerald-500/15 text-emerald-400";
  if (minutes <= 15) return "bg-amber-500/15 text-amber-400";
  return "bg-zinc-500/15 text-zinc-400";
}

function etaLabel(minutes: number): string {
  if (minutes <= 0) return "Departed";
  return `${minutes} min`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ArrivalCard({
  data,
  onLocationClick,
  stale,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
}: {
  data: DisplayArrivalsInput;
  onLocationClick?: (pin: LocationPin) => void;
  stale?: boolean;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden ${stale ? "opacity-45 grayscale" : ""}`}>
      {/* Header with title and refresh */}
      {(data.title || onRefresh) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
          {data.title && (
            <h3 className="text-[14px] font-semibold text-white">{data.title}</h3>
          )}
          {onRefresh && (
            <div className="flex items-center gap-2 ml-auto">
              {lastRefreshedAt ? (
                <span className="text-[11px] text-zinc-500">
                  {formatTime(lastRefreshedAt)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center justify-center size-6 rounded-full hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors text-zinc-400 hover:text-zinc-300 disabled:opacity-50"
                aria-label="Refresh arrivals"
              >
                <IconRefresh size={13} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="divide-y divide-white/[0.04]">
        {data.stops.map((stop, i) => (
          <div key={i} className="px-4 py-3 space-y-2">
            {/* Stop name as clickable location button */}
            <button
              type="button"
              onClick={() =>
                onLocationClick?.({
                  name: stop.name,
                  lat: stop.lat,
                  lng: stop.lng,
                })
              }
              className="inline-flex items-center gap-1.5 text-[13px] text-blue-400 hover:text-blue-300 active:scale-[0.97] transition-all"
            >
              <IconMapPin size={13} className="shrink-0" />
              <span className="underline underline-offset-2 decoration-blue-400/40 text-left">
                {stop.name}
              </span>
            </button>

            {/* Arrivals per route */}
            <div className="space-y-1.5">
              {stop.arrivals.map((arrival, j) => (
                <div key={j} className="flex items-center gap-2">
                  {/* Route badge */}
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-[12px] font-semibold text-white shrink-0">
                    <IconBus size={11} className="text-zinc-400" />
                    {arrival.route}
                  </span>
                  <span className="text-[12px] text-zinc-500 truncate min-w-0">
                    → {arrival.destination}
                  </span>
                  {/* ETA pills */}
                  <div className="flex gap-1 ml-auto shrink-0">
                    {arrival.etas.map((eta, k) => (
                      <span
                        key={k}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${etaColor(eta.minutes)}`}
                        title={eta.remarks}
                      >
                        {etaLabel(eta.minutes)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
