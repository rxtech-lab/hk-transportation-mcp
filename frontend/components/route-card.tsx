"use client";

import { useState } from "react";
import { IconBus, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import type { DisplayRouteInput } from "@/lib/tools/display-route";
import type { RouteInfoData, RouteVariant } from "@/lib/route-query";
import type { LocationPin } from "@/components/chat-messages";

/** Stops shown inline before the card collapses into "show all". */
const DEFAULT_VISIBLE_STOPS = 5;

function operatorBadgeClass(operator?: string): string {
  switch (operator) {
    case "GMB":
      return "bg-emerald-500";
    case "KMB":
      return "bg-red-600";
    default:
      return "bg-blue-500";
  }
}

export function RouteCard({
  input,
  data,
  onLocationClick,
  stale,
}: {
  input: DisplayRouteInput;
  data?: RouteInfoData | null;
  onLocationClick?: (pin: LocationPin) => void;
  stale?: boolean;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const variants = data?.routes ?? [];
  const variant: RouteVariant | undefined =
    variants[Math.min(selectedIdx, variants.length - 1)];

  if (!data) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-bold text-white ${operatorBadgeClass(input.operator)}`}
        >
          <IconBus size={12} />
          {input.route}
        </span>
        <span className="flex gap-0.5">
          <span className="typing-dot size-1 rounded-full bg-zinc-500" />
          <span className="typing-dot size-1 rounded-full bg-zinc-500" />
          <span className="typing-dot size-1 rounded-full bg-zinc-500" />
        </span>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[13px] text-zinc-400">
        <IconBus size={15} />
        {data.error
          ? `Couldn't load route ${input.route}. Reload or ask again.`
          : `No route information found for ${input.route}`}
      </div>
    );
  }

  const visibleStops = expanded
    ? variant.stops
    : variant.stops.slice(0, DEFAULT_VISIBLE_STOPS);
  const hiddenCount = variant.stops.length - visibleStops.length;

  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden ${stale ? "opacity-45 grayscale" : ""}`}
    >
      {/* Header: route badge + destination */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-bold text-white shrink-0 ${operatorBadgeClass(variant.operator)}`}
        >
          <IconBus size={12} />
          {variant.route}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-white">
            {variant.destination}
          </h3>
          <p className="truncate text-[11px] text-zinc-500">
            {variant.stop_count} stops
            {variant.operator ? ` · ${variant.operator}` : ""}
          </p>
        </div>
      </div>

      {/* Direction switcher — only when the number runs more than one way */}
      {variants.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pt-3">
          {variants.map((v, i) => {
            const active = i === selectedIdx;
            return (
              <button
                key={v.route_id}
                type="button"
                onClick={() => {
                  setSelectedIdx(i);
                  setExpanded(false);
                }}
                className={`shrink-0 max-w-[220px] truncate rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                  active
                    ? "border-blue-400/35 bg-blue-500/15 font-semibold text-blue-400"
                    : "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]"
                }`}
              >
                → {v.destination}
              </button>
            );
          })}
        </div>
      )}

      {/* Stop timeline */}
      <div className="px-4 py-2">
        {visibleStops.map((stop, i) => {
          const isFirst = i === 0;
          const isLast = i === visibleStops.length - 1 && hiddenCount === 0;
          return (
            <button
              key={`${stop.id}-${stop.seq}`}
              type="button"
              onClick={() =>
                onLocationClick?.({
                  name: stop.name,
                  lat: stop.lat,
                  lng: stop.lng,
                })
              }
              className="flex w-full items-stretch gap-2.5 text-left hover:bg-white/[0.03] rounded-md transition-colors"
            >
              <span className="relative flex w-3 shrink-0 flex-col items-center">
                <span
                  className={`w-0.5 flex-1 ${isFirst ? "bg-transparent" : "bg-blue-500"}`}
                />
                <span
                  className={`size-[9px] shrink-0 rounded-full border-2 border-blue-500 ${
                    isFirst || isLast ? "bg-blue-500" : "bg-zinc-950"
                  }`}
                />
                <span
                  className={`w-0.5 flex-1 ${isLast ? "bg-transparent" : "bg-blue-500"}`}
                />
              </span>
              <span
                className={`truncate py-1.5 text-[13px] ${
                  isFirst || isLast
                    ? "font-semibold text-white"
                    : "text-zinc-300"
                }`}
              >
                {stop.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expand / collapse */}
      {variant.stops.length > DEFAULT_VISIBLE_STOPS && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-center gap-1 border-t border-white/[0.06] py-2.5 text-[13px] font-medium text-blue-400 hover:bg-white/[0.03] transition-colors"
        >
          {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          {expanded ? "Show less" : `Show all ${variant.stops.length} stops`}
        </button>
      )}
    </div>
  );
}
