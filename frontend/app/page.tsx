"use client";

import { useState, useCallback, useRef, useEffect, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls, isToolUIPart } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import type { DisplayArrivalsInput } from "@/lib/tools/display-arrivals";
import { IconBus, IconMap, IconPlus } from "@tabler/icons-react";
import { ChatInput } from "@/components/chat-input";
import { ChatMessages, type MapData, type LocationPin } from "@/components/chat-messages";
import { TransportMap } from "@/components/transport-map";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useArrivalsRefresh } from "@/hooks/use-arrivals-refresh";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  loadStoredMessages,
  useChatStorage,
  clearChatStorage,
} from "@/hooks/use-chat-storage";

export default function Home() {
  const [isLanding, setIsLanding] = useState(true);
  const [mapData, setMapData] = useState<MapData>({ stops: [], routes: [] });
  const [arrivalsOverride, setArrivalsOverride] = useState<DisplayArrivalsInput | null>(null);
  const [showMobileMap, setShowMobileMap] = useState(false);
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null);
  const [mapWidthPct, setMapWidthPct] = useState(45);
  const containerRef = useRef<HTMLDivElement>(null);
  const geo = useGeolocation();
  const { dict } = useI18n();
  const geoRequestedRef = useRef(false);

  const { messages, sendMessage, status, setMessages, error, addToolOutput } =
    useChat({
      id: "hk-transport",
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall({ toolCall }) {
        if (toolCall.toolName === "display_arrivals") {
          const input = (toolCall as { input: unknown }).input as DisplayArrivalsInput;
          // Update map with stops from arrival data
          if (input.stops?.length) {
            setMapData((prev) => {
              const newStops = input.stops
                .filter(
                  (s) =>
                    typeof s.lat === "number" && typeof s.lng === "number"
                )
                .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, arrivals: s.arrivals }));
              const existing = new Set(
                prev.stops.map((s) => `${s.lat},${s.lng}`)
              );
              const unique = newStops.filter(
                (s) => !existing.has(`${s.lat},${s.lng}`)
              );
              return {
                ...prev,
                stops: [...prev.stops, ...unique],
              };
            });
          }
          // Provide tool output back to the model
          addToolOutput({
            tool: "display_arrivals" as never,
            toolCallId: toolCall.toolCallId,
            output: "Arrival card displayed to user.",
          });
        }
      },
    });

  useChatStorage(messages);

  // Derive arrivalsData from messages — always reflects the latest display_arrivals tool call
  const arrivalsFromMessages = useMemo(() => {
    let last: DisplayArrivalsInput | null = null;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (isToolUIPart(part)) {
          const tn = "toolName" in part ? String(part.toolName) : part.type.replace(/^tool-/, "");
          if (tn === "display_arrivals" && part.input) {
            last = part.input as DisplayArrivalsInput;
          }
        }
      }
    }
    return last;
  }, [messages]);

  // Use override from refresh (with updated ETAs) if available, otherwise derive from messages
  const arrivalsData = arrivalsOverride ?? arrivalsFromMessages;

  const { lastRefreshedAt, refetch: refetchArrivals, isRefreshing } = useArrivalsRefresh(arrivalsData, setArrivalsOverride);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = loadStoredMessages();
    if (stored.length > 0) {
      setMessages(stored);
      setIsLanding(false);
    }
  }, [setMessages]);

  const handleMapData = useCallback((data: MapData) => {
    setMapData(data);
  }, []);

  const handleLocationClick = useCallback((pin: LocationPin) => {
    setSelectedPin(pin);
    // Only open drawer on mobile (md breakpoint = 768px)
    if (window.innerWidth < 768) {
      setShowMobileMap(true);
    }
  }, []);

  const handleSend = async (text: string) => {
    if (!geoRequestedRef.current) {
      geoRequestedRef.current = true;
      geo.request();
    }
    if (isLanding) setIsLanding(false);
    // Clear refresh override so next response's data takes over
    setArrivalsOverride(null);
    sendMessage(
      { text },
      {
        body: {
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
      }
    );
  };

  const handleClear = () => {
    setMessages([]);
    setMapData({ stops: [], routes: [] });
    setArrivalsOverride(null);
    clearChatStorage();
    setIsLanding(true);
    setShowMobileMap(false);
    geoRequestedRef.current = false;
  };

  const handleDragStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = mapWidthPct;
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.offsetWidth;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startX;
      // Moving right = shrink map, moving left = grow map
      const newPct = startPct - (dx / containerWidth) * 100;
      setMapWidthPct(Math.max(20, Math.min(70, newPct)));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [mapWidthPct]);

  const isLoading = status === "streaming" || status === "submitted";
  const hasMapContent = mapData.stops.length > 0 || mapData.routes.length > 0;

  const userLocation =
    geo.latitude && geo.longitude
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  return (
    <div className="flex flex-col h-[100dvh] bg-zinc-950 overflow-hidden">
      <AnimatePresence mode="wait">
        {isLanding ? (
          <motion.div
            key="landing"
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="relative flex flex-col flex-1 items-center justify-center px-6 overflow-hidden"
          >
            {/* Language switcher - top right */}
            <div className="absolute top-4 right-4 z-20">
              <LanguageSwitcher />
            </div>

            {/* Colorful spotlights */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <motion.div
                className="absolute w-[400px] h-[400px] rounded-full bg-blue-500/20 blur-[120px]"
                animate={{
                  x: [0, 120, -80, 40, 0],
                  y: [0, -80, 60, -40, 0],
                  scale: [1, 1.2, 0.9, 1.1, 1],
                }}
                transition={{
                  duration: 16,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ top: "20%", left: "15%" }}
              />
              <motion.div
                className="absolute w-[350px] h-[350px] rounded-full bg-violet-500/20 blur-[120px]"
                animate={{
                  x: [0, -100, 60, -30, 0],
                  y: [0, 50, -90, 30, 0],
                  scale: [1, 0.9, 1.15, 1, 1],
                }}
                transition={{
                  duration: 19,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ top: "30%", right: "10%" }}
              />
              <motion.div
                className="absolute w-[300px] h-[300px] rounded-full bg-cyan-400/18 blur-[100px]"
                animate={{
                  x: [0, 70, -110, 50, 0],
                  y: [0, -50, 30, -70, 0],
                  scale: [1, 1.1, 0.85, 1.05, 1],
                }}
                transition={{
                  duration: 14,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ bottom: "25%", left: "25%" }}
              />
              <motion.div
                className="absolute w-[350px] h-[350px] rounded-full bg-rose-500/15 blur-[120px]"
                animate={{
                  x: [0, -70, 90, -50, 0],
                  y: [0, 80, -40, 60, 0],
                  scale: [1, 1.15, 0.95, 1.1, 1],
                }}
                transition={{
                  duration: 22,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ bottom: "15%", right: "20%" }}
              />
              <motion.div
                className="absolute w-[280px] h-[280px] rounded-full bg-amber-400/15 blur-[100px]"
                animate={{
                  x: [0, 90, -60, 40, 0],
                  y: [0, -70, 90, -30, 0],
                  scale: [1, 0.95, 1.2, 0.9, 1],
                }}
                transition={{
                  duration: 18,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ top: "40%", left: "45%" }}
              />
              <motion.div
                className="absolute w-[320px] h-[320px] rounded-full bg-emerald-400/15 blur-[110px]"
                animate={{
                  x: [0, -80, 100, -60, 0],
                  y: [0, 60, -80, 40, 0],
                  scale: [1, 1.1, 0.9, 1.15, 1],
                }}
                transition={{
                  duration: 21,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ top: "15%", right: "30%" }}
              />
            </div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }}
              className="relative z-10 text-center mb-12"
            >
              <div className="mx-auto mb-6 flex items-center justify-center size-16 rounded-2xl bg-gradient-to-b from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
                <IconBus size={32} className="text-white" />
              </div>
              <h1 className="text-[2rem] sm:text-4xl font-bold tracking-tight text-white">
                {dict.landing.title}
              </h1>
              <p className="mt-3 text-zinc-500 text-[15px] leading-relaxed max-w-sm mx-auto">
                {dict.landing.subtitle}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.15,
                ease: [0.32, 0.72, 0, 1],
              }}
              className="relative z-10 w-full max-w-xl"
            >
              <ChatInput onSubmit={handleSend} placeholder={dict.chat.inputPlaceholder} />

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                {dict.landing.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSend(suggestion)}
                    className="px-4 py-2 rounded-full text-[13px] text-zinc-400 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all duration-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            ref={containerRef}
            className="flex flex-1 min-h-0 relative"
          >
            {/* Chat panel */}
            <div className="flex flex-col flex-1 min-w-0">
              {/* Header bar */}
              <div className="vibrancy sticky top-0 z-30 flex items-center justify-between px-4 sm:px-5 h-12 border-b border-white/[0.06] bg-zinc-950/70">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center size-7 rounded-lg bg-gradient-to-b from-blue-500 to-indigo-600">
                    <IconBus size={15} className="text-white" />
                  </div>
                  <h2 className="text-[15px] font-semibold text-white tracking-tight">
                    {dict.chat.headerTitle}
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <LanguageSwitcher />
                  <button
                    onClick={handleClear}
                    className="flex items-center justify-center size-8 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                    aria-label={dict.chat.newChat}
                  >
                    <IconPlus size={18} />
                  </button>
                </div>
              </div>

              <ChatMessages
                messages={messages}
                onMapData={handleMapData}
                onLocationClick={handleLocationClick}
                isLoading={isLoading}
                arrivalsData={arrivalsData}
                lastRefreshedAt={lastRefreshedAt}
                onRefresh={refetchArrivals}
                isRefreshing={isRefreshing}
              />

              {/* Error display */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="mx-4 mb-2 rounded-2xl bg-red-500/10 border border-red-500/15 px-4 py-3 text-[13px] text-red-400"
                  >
                    {error.message || dict.chat.errorFallback}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input area */}
              <div className="safe-bottom border-t border-white/[0.06] bg-zinc-950/80 vibrancy">
                {/* Map button bar - top row on mobile */}
                <div className="md:hidden border-b border-white/[0.06]">
                  <button
                    onClick={() => setShowMobileMap(true)}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-white/[0.04] active:bg-white/[0.06] transition-colors"
                  >
                    <IconMap size={18} className="text-blue-400" />
                    <span className="text-[13px] font-medium text-zinc-300">
                      {hasMapContent
                        ? `${mapData.stops.length} ${mapData.stops.length !== 1 ? dict.chat.stops : dict.chat.stop}${mapData.routes.length > 0 ? ` · ${mapData.routes.length} ${mapData.routes.length !== 1 ? dict.chat.routes : dict.chat.route}` : ""}`
                        : dict.chat.map}
                    </span>
                    <span className="ml-auto px-3 py-1 rounded-lg bg-blue-500 text-white text-[12px] font-medium">
                      {dict.chat.view}
                    </span>
                  </button>
                </div>

                <div className="px-3 sm:px-4 pt-2 pb-3 sm:pb-4">
                  <ChatInput
                    onSubmit={handleSend}
                    disabled={isLoading}
                    compact
                    placeholder={dict.chat.inputPlaceholder}
                  />
                </div>
              </div>
            </div>

            {/* Desktop drag handle */}
            <div
              onPointerDown={handleDragStart}
              className="hidden md:flex items-center justify-center w-1.5 cursor-col-resize hover:bg-blue-500/20 active:bg-blue-500/30 transition-colors group"
            >
              <div className="w-0.5 h-8 rounded-full bg-zinc-700 group-hover:bg-blue-400 transition-colors" />
            </div>

            {/* Desktop map panel */}
            <div
              className="hidden md:block h-full shrink-0 border-l border-white/[0.06]"
              style={{ width: `${mapWidthPct}%` }}
            >
              <TransportMap
                mapData={mapData}
                userLocation={userLocation}
                selectedPin={selectedPin}
              />
            </div>

            {/* Mobile map drawer */}
            <Drawer
              open={showMobileMap}
              onOpenChange={setShowMobileMap}
            >
              <DrawerContent className="md:hidden h-[70dvh]">
                <DrawerHeader className="pb-0">
                  <DrawerTitle className="text-[15px]">{dict.map.title}</DrawerTitle>
                </DrawerHeader>
                <div className="flex-1 min-h-0 p-4 pt-2">
                  <div className="h-full rounded-2xl overflow-hidden">
                    <TransportMap
                      mapData={mapData}
                      userLocation={userLocation}
                      selectedPin={selectedPin}
                    />
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
