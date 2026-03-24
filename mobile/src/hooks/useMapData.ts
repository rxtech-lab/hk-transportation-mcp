import { useMemo } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import type { DisplayArrivalsInput, MapData, MapStop, StopData } from "@/lib/types";
import { ROUTE_COLORS } from "@/constants/map";

export function extractMapData(
  messages: UIMessage[],
  arrivalsData?: DisplayArrivalsInput | null
): MapData {
  const stops: MapStop[] = [];
  const routes: MapData["routes"] = [];
  let colorIdx = 0;

  let lastArrivalsId: string | null = null;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (isToolUIPart(part)) {
        const tn =
          "toolName" in part
            ? String(part.toolName)
            : part.type.replace(/^tool-/, "");
        if (tn === "display_arrivals") lastArrivalsId = part.toolCallId;
      }
    }
  }

  const freshArrivals = new Map<string, StopData>();
  if (arrivalsData?.stops) {
    for (const s of arrivalsData.stops) {
      const key = s.id || `${s.lat},${s.lng}`;
      freshArrivals.set(key, s);
    }
  }

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;

    for (const part of msg.parts) {
      if (!isToolUIPart(part)) continue;

      const toolName =
        "toolName" in part
          ? String(part.toolName)
          : part.type.replace(/^tool-/, "");

      if (toolName === "display_arrivals" && part.input) {
        if (part.toolCallId !== lastArrivalsId) continue;
        const input = part.input as DisplayArrivalsInput;
        // Use arrivalsData stops for URL-based flow where input.stops is empty
        const stopsSource = input.stops?.length ? input.stops : arrivalsData?.stops;
        if (stopsSource) {
          for (const stop of stopsSource) {
            if (typeof stop.lat === "number" && typeof stop.lng === "number") {
              const key = stop.id || `${stop.lat},${stop.lng}`;
              const fresh = freshArrivals.get(key);
              stops.push({
                id: stop.id,
                name: stop.name,
                name_en: stop.name_en,
                name_tc: stop.name_tc,
                name_sc: stop.name_sc,
                lat: stop.lat,
                lng: stop.lng,
                arrivals: fresh?.arrivals ?? stop.arrivals,
              });
            }
          }
        }
        continue;
      }

      if (part.state !== "output-available") continue;

      const result = part.output;
      if (!result) continue;

      let data: unknown = result;
      if (
        typeof result === "object" &&
        result !== null &&
        "content" in result &&
        Array.isArray((result as { content: unknown[] }).content)
      ) {
        const textPart = (
          result as { content: { type: string; text?: string }[] }
        ).content.find((c) => c.type === "text" && c.text);
        if (textPart?.text) {
          try {
            data = JSON.parse(textPart.text);
          } catch {
            data = result;
          }
        }
      }

      if (typeof data !== "object" || data === null) continue;

      const extractStops = (obj: unknown): MapStop[] => {
        const found: MapStop[] = [];
        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (item && typeof item === "object") {
              const lat = item.lat ?? item.latitude ?? item.stop_lat;
              const lng =
                item.lng ?? item.longitude ?? item.stop_lng ?? item.stop_lon;
              const name =
                item.name ?? item.stop_name ?? item.stop ?? "Stop";
              if (typeof lat === "number" && typeof lng === "number") {
                found.push({ name: String(name), lat, lng });
              }
            }
            found.push(...extractStops(item));
          }
        } else if (typeof obj === "object" && obj !== null) {
          for (const val of Object.values(obj)) {
            found.push(...extractStops(val));
          }
        }
        return found;
      };

      const foundStops = extractStops(data);
      if (foundStops.length > 0) {
        stops.push(...foundStops);

        if (toolName === "route_arrivals" && foundStops.length > 1) {
          const input = part.input as Record<string, unknown> | null;
          const routeName =
            input && "route" in input
              ? String(input.route)
              : `Route ${routes.length + 1}`;
          routes.push({
            name: routeName,
            color: ROUTE_COLORS[colorIdx % ROUTE_COLORS.length],
            stops: foundStops,
          });
          colorIdx++;
        }
      }
    }
  }

  const uniqueStops = stops.filter(
    (s, i, arr) =>
      arr.findIndex((o) => o.lat === s.lat && o.lng === s.lng) === i
  );

  return { stops: uniqueStops, routes };
}

export function useMapData(
  messages: UIMessage[],
  arrivalsData?: DisplayArrivalsInput | null
): MapData {
  return useMemo(
    () => extractMapData(messages, arrivalsData),
    [messages, arrivalsData]
  );
}
