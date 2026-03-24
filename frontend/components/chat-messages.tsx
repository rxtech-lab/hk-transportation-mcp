"use client";

import { useEffect, useRef, useMemo } from "react";
import { type UIMessage, isToolUIPart } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { IconTool, IconMapPin } from "@tabler/icons-react";
import { ArrivalCard } from "@/components/arrival-card";
import type { DisplayArrivalsInput } from "@/lib/tools/display-arrivals";

export interface LocationPin {
  name: string;
  lat: number;
  lng: number;
}

interface ChatMessagesProps {
  messages: UIMessage[];
  onMapData?: (data: MapData) => void;
  onLocationClick?: (pin: LocationPin) => void;
  isLoading?: boolean;
  arrivalsData?: DisplayArrivalsInput | null;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export interface StopArrival {
  route: string;
  destination: string;
  etas: { minutes: number; remarks?: string }[];
}

export interface MapStop {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  arrivals?: StopArrival[];
}

export interface MapRoute {
  name: string;
  color: string;
  stops: MapStop[];
}

export interface MapData {
  stops: MapStop[];
  routes: MapRoute[];
}

const ROUTE_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
];

function extractMapData(messages: UIMessage[], arrivalsData?: DisplayArrivalsInput | null): MapData {
  const stops: MapStop[] = [];
  const routes: MapRoute[] = [];
  let colorIdx = 0;

  // Find the last display_arrivals tool call ID
  let lastArrivalsId: string | null = null;
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts) {
      if (isToolUIPart(part)) {
        const tn = "toolName" in part ? String(part.toolName) : part.type.replace(/^tool-/, "");
        if (tn === "display_arrivals") lastArrivalsId = part.toolCallId;
      }
    }
  }

  // Build a lookup from arrivalsData for fresh arrival info
  const freshArrivals = new Map<string, NonNullable<DisplayArrivalsInput["stops"]>[0]>();
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

      // display_arrivals is a client-side tool — only show stops from the latest call on map
      if (toolName === "display_arrivals" && part.input) {
        if (part.toolCallId !== lastArrivalsId) continue;
        const input = part.input as DisplayArrivalsInput;
        if (input.stops) {
          for (const stop of input.stops) {
            if (typeof stop.lat === "number" && typeof stop.lng === "number") {
              const key = stop.id || `${stop.lat},${stop.lng}`;
              const fresh = freshArrivals.get(key);
              stops.push({
                id: stop.id,
                name: stop.name,
                lat: stop.lat,
                lng: stop.lng,
                arrivals: fresh?.arrivals ?? stop.arrivals,
              });
            }
          }
        }
        continue;
      }

      // MCP tools — need output to be available
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
              const name = item.name ?? item.stop_name ?? item.stop ?? "Stop";
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

const COORD_HREF_REGEX = /^([0-9.-]+),\s*([0-9.-]+)$/;

function createMarkdownComponents(onLocationClick?: (pin: LocationPin) => void) {
  return {
    // Markdown parses 📍[Name](lat,lng) as a link with href="lat,lng"
    // Intercept these and render as LocationButton
    a: ({ href, children, ...props }: React.ComponentProps<"a">) => {
      if (href) {
        const match = COORD_HREF_REGEX.exec(href);
        if (match) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);
          const name = typeof children === "string" ? children : String(children);
          return (
            <LocationButton
              name={name}
              lat={lat}
              lng={lng}
              onClick={onLocationClick}
            />
          );
        }
      }
      return (
        <a
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
          href={href}
          {...props}
        >
          {children}
        </a>
      );
    },
    // Strip the 📍 emoji that precedes location links
    text: ({ children }: { children?: React.ReactNode }) => {
      if (typeof children !== "string") return <>{children}</>;
      return <>{children.replace(/📍/g, "")}</>;
    },
    table: (props: React.ComponentProps<"table">) => (
      <div className="overflow-x-auto my-3 rounded-xl border border-white/[0.06] -mx-1">
        <table className="min-w-full border-collapse text-[13px]" {...props} />
      </div>
    ),
    th: (props: React.ComponentProps<"th">) => (
      <th
        className="border-b border-white/[0.06] px-3 py-2 text-left text-zinc-400 bg-white/[0.03] font-medium text-[12px] uppercase tracking-wide whitespace-nowrap min-w-[100px]"
        {...props}
      />
    ),
    td: (props: React.ComponentProps<"td">) => (
      <td
        className="border-b border-white/[0.04] px-3 py-2 whitespace-nowrap min-w-[100px]"
        {...props}
      />
    ),
    p: (props: React.ComponentProps<"p">) => (
      <p className="mb-2.5 last:mb-0" {...props} />
    ),
    strong: (props: React.ComponentProps<"strong">) => (
      <strong className="font-semibold text-white" {...props} />
    ),
    ul: (props: React.ComponentProps<"ul">) => (
      <ul className="list-disc pl-5 mb-2.5" {...props} />
    ),
    ol: (props: React.ComponentProps<"ol">) => (
      <ol className="list-decimal pl-5 mb-2.5" {...props} />
    ),
    li: (props: React.ComponentProps<"li">) => (
      <li className="mb-1" {...props} />
    ),
    code: (props: React.ComponentProps<"code">) => (
      <code
        className="bg-white/[0.08] rounded-md px-1.5 py-0.5 text-[13px] font-mono"
        {...props}
      />
    ),
  };
}

function LocationButton({
  name,
  lat,
  lng,
  onClick,
}: {
  name: string;
  lat: number;
  lng: number;
  onClick?: (pin: LocationPin) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.({ name, lat, lng })}
      className="inline-flex items-start gap-1 rounded-md bg-blue-500/[0.08] px-1.5 py-0.5 text-[13px] text-blue-400 hover:bg-blue-500/15 active:scale-[0.97] transition-all cursor-pointer align-baseline leading-normal text-left"
    >
      <IconMapPin size={12} className="shrink-0 relative top-[1px]" />
      <span className="underline underline-offset-2 decoration-blue-400/40">{name}</span>
    </button>
  );
}


function ToolCallBadge({
  toolName,
  state,
}: {
  toolName: string;
  state: string;
}) {
  const isDone = state === "output-available";
  const isError = state === "output-error";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
        isDone
          ? "bg-emerald-500/10 text-emerald-400"
          : isError
            ? "bg-red-500/10 text-red-400"
            : "bg-white/[0.04] text-zinc-500"
      }`}
    >
      <IconTool size={12} />
      <span className="font-mono">{toolName}</span>
      {!isDone && !isError && (
        <span className="flex gap-0.5 ml-0.5">
          <span className="typing-dot size-1 rounded-full bg-current" />
          <span className="typing-dot size-1 rounded-full bg-current" />
          <span className="typing-dot size-1 rounded-full bg-current" />
        </span>
      )}
    </div>
  );
}

export function ChatMessages({
  messages,
  onMapData,
  onLocationClick,
  isLoading,
  arrivalsData,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const mdComponents = useMemo(
    () => createMarkdownComponents(onLocationClick),
    [onLocationClick]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const data = extractMapData(messages, arrivalsData);
    onMapData?.(data);
  }, [messages, arrivalsData, onMapData]);

  if (messages.length === 0) return null;

  // Build dedup maps
  const latestToolState = new Map<string, string>();
  let lastArrivalsToolCallId: string | null = null;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (isToolUIPart(part)) {
        latestToolState.set(part.toolCallId, part.state);
        const tn = "toolName" in part ? String(part.toolName) : part.type.replace(/^tool-/, "");
        if (tn === "display_arrivals") {
          lastArrivalsToolCallId = part.toolCallId;
        }
      }
    }
  }
  const renderedTools = new Set<string>();

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-6 space-y-5">
      {messages.map((msg, i) => {
        // For assistant messages, figure out which tool parts to render in this message
        const toolPartsToRender = new Set<string>();
        if (msg.role === "assistant") {
          for (const part of msg.parts) {
            if (!isToolUIPart(part)) continue;
            if (renderedTools.has(part.toolCallId)) continue;
            if (latestToolState.get(part.toolCallId) !== part.state) continue;
            toolPartsToRender.add(part.toolCallId);
          }
          // Mark as rendered
          for (const id of toolPartsToRender) {
            renderedTools.add(id);
          }
        }

        const textParts = msg.parts.filter(
          (p) => p.type === "text" && p.text.trim()
        );
        const hasContent =
          msg.role === "user" ||
          textParts.length > 0 ||
          toolPartsToRender.size > 0;
        if (!hasContent) return null;

        // User message - bubble style
        if (msg.role === "user") {
          return (
            <motion.div
              key={`${msg.id}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.32, 0.72, 0, 1],
              }}
              className="flex justify-end"
            >
              <div className="max-w-[85%] sm:max-w-[75%] rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed bg-blue-500 text-white">
                {textParts.map((part, j) =>
                  part.type === "text" ? (
                    <span key={`t-${j}`} className="whitespace-pre-wrap">
                      {part.text}
                    </span>
                  ) : null
                )}
              </div>
            </motion.div>
          );
        }

        // Assistant message - no bubble, render parts in order
        return (
          <motion.div
            key={`${msg.id}-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.32, 0.72, 0, 1],
            }}
            className="text-[15px] leading-relaxed text-zinc-200 space-y-2"
          >
            {msg.parts.map((part, j) => {
              // Text part
              if (part.type === "text" && part.text.trim()) {
                return (
                  <Markdown
                    key={`text-${j}`}
                    remarkPlugins={[remarkGfm]}
                    components={mdComponents}
                  >
                    {part.text}
                  </Markdown>
                );
              }

              // Tool part - render inline in order, with dedup
              if (isToolUIPart(part) && toolPartsToRender.has(part.toolCallId)) {
                const toolName =
                  "toolName" in part
                    ? String(part.toolName)
                    : part.type.replace(/^tool-/, "");

                // Render ArrivalCard for display_arrivals tool
                if (toolName === "display_arrivals" && part.input) {
                  const isLatest = part.toolCallId === lastArrivalsToolCallId;
                  const cardData = (isLatest && arrivalsData) ? arrivalsData : (part.input as DisplayArrivalsInput);
                  return (
                    <div key={part.toolCallId} className="py-1">
                      <ArrivalCard
                        data={cardData}
                        onLocationClick={onLocationClick}
                        stale={!isLatest}
                        lastRefreshedAt={isLatest ? lastRefreshedAt : undefined}
                        onRefresh={isLatest ? onRefresh : undefined}
                        isRefreshing={isLatest ? isRefreshing : undefined}
                      />
                    </div>
                  );
                }

                return (
                  <div key={part.toolCallId} className="py-0.5">
                    <ToolCallBadge
                      toolName={toolName}
                      state={part.state}
                    />
                  </div>
                );
              }

              return null;
            })}
          </motion.div>
        );
      })}

      {/* Typing indicator */}
      <AnimatePresence>
        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1]?.role === "user" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex gap-1.5 py-2 w-fit"
            >
              <span className="typing-dot size-2 rounded-full bg-zinc-500" />
              <span className="typing-dot size-2 rounded-full bg-zinc-500" />
              <span className="typing-dot size-2 rounded-full bg-zinc-500" />
            </motion.div>
          )}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
}
