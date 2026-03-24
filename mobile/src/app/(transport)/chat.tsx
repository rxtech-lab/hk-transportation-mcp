import { useState, useCallback, useRef, useEffect, useMemo, use } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isToolUIPart } from "ai";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams, useSegments } from "expo-router";

import * as Haptics from "expo-haptics";
import { useThrottle } from "@uidotdev/usehooks";

import { ChatMessagesList } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { useTheme } from "@/hooks/use-theme";
import { useArrivalsRefresh } from "@/hooks/useArrivalsRefresh";
import { useChatSessionStorage } from "@/hooks/useChatSessions";
import {
  createSession,
  loadSessionMessages,
  getSessionTitle,
  updateSessionTitle,
} from "@/lib/db";
import { useMapData } from "@/hooks/useMapData";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { FRONTEND_URL } from "@/lib/config";
import { TabBarContext } from "@/app/_layout";
import { ChatStreamContext } from "@/contexts/ChatStreamContext";
import { MapDataContext, ArrivalsSheetContext } from "./_ctx";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initialMessage, sessionId: paramSessionId } = useLocalSearchParams<{
    initialMessage?: string;
    sessionId?: string;
  }>();
  const segments = useSegments();
  const routePrefix = segments[0] === "history" ? "/history" : "/(transport)";
  const { setIsTabBarHidden } = use(TabBarContext);
  const { setData: setMapScreenData } = use(MapDataContext);
  const [arrivalsOverride, setArrivalsOverride] =
    useState<DisplayArrivalsInput | null>(null);
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null);
  const { setSheetData } = use(ArrivalsSheetContext);
  const [sessionTitle, setSessionTitle] = useState<string | null>(
    paramSessionId ? getSessionTitle(paramSessionId) : null,
  );
  const { dict } = useI18n();
  const theme = useTheme();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Consume chat stream from context
  const {
    currentChatId,
    setChatId,
    messages,
    sendMessage,
    regenerate,
    status,
    error,
    setMessages,
    addToolOutput,
    geo,
    fetchedArrivals,
    fetchedArrivalsVersion,
  } = use(ChatStreamContext);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener("keyboardWillHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const geoRequestedRef = useRef(false);
  const initialMessageSentRef = useRef(false);
  const titleGeneratedRef = useRef(false);
  const prevStatusRef = useRef<string>("");

  // Hide tab bar on mount, restore on unmount
  useEffect(() => {
    setIsTabBarHidden(true);
    return () => setIsTabBarHidden(false);
  }, [setIsTabBarHidden]);

  // Haptic feedback when assistant starts streaming
  useEffect(() => {
    if (prevStatusRef.current !== "streaming" && status === "streaming") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [status]);

  // Haptic feedback as new text streams in (throttled)
  const streamingTextLength = useMemo(() => {
    if (status !== "streaming") return 0;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return 0;
    return lastMsg.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .reduce((len, p) => len + p.text.length, 0);
  }, [messages, status]);

  const throttledTextLength = useThrottle(streamingTextLength, 300);
  const prevTextLengthRef = useRef(0);

  useEffect(() => {
    if (throttledTextLength > prevTextLengthRef.current && status === "streaming") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevTextLengthRef.current = throttledTextLength;
  }, [throttledTextLength, status]);

  useChatSessionStorage(currentChatId, messages);

  // Auto-generate title after first assistant response
  useEffect(() => {
    if (titleGeneratedRef.current || !currentChatId || messages.length < 2) {
      return;
    }
    const wasStreaming = prevStatusRef.current === "streaming";
    prevStatusRef.current = status;

    if (wasStreaming && status === "ready") {
      titleGeneratedRef.current = true;
      const titleMessages = messages.slice(0, 4).map((m: { role: string; parts: Array<{ type: string; text?: string }> }) => ({
        role: m.role,
        content: m.parts
          .filter((p: { type: string; text?: string }): p is { type: "text"; text: string } => p.type === "text")
          .map((p: { type: string; text: string }) => p.text)
          .join(""),
      }));

      fetch(`${FRONTEND_URL}/api/chat/title`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: titleMessages }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.title) {
            updateSessionTitle(currentChatId, data.title);
            setSessionTitle(data.title);
          }
        })
        .catch(() => {});
    }
  }, [status, messages, currentChatId]);

  // Fix incomplete tool calls from restored sessions
  const toolCallFixedRef = useRef(false);
  useEffect(() => {
    if (toolCallFixedRef.current || messages.length === 0) return;

    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (
          isToolUIPart(part) &&
          (part.state === "input-available" || part.state === "input-streaming")
        ) {
          const toolName = "toolName" in part ? String(part.toolName) : part.type.replace(/^tool-/, "");
          addToolOutput({
            tool: toolName as never,
            toolCallId: part.toolCallId,
            output: JSON.stringify({
              error: "Tool call was interrupted. Please try again.",
            }),
          });
        }
      }
    }
    toolCallFixedRef.current = true;
  }, [messages, addToolOutput]);

  // Restore stored messages or send initial message
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (initialMessage && paramSessionId) {
      // New session created by landing page with initial message
      initialMessageSentRef.current = true;
      if (!geoRequestedRef.current) {
        geoRequestedRef.current = true;
        geo.request();
      }
      setChatId(paramSessionId, {
        messages: [
          {
            id: `user-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: initialMessage }],
          },
        ],
        regenerate: true,
      });
    } else if (paramSessionId) {
      // Loading existing session from history
      const stored = loadSessionMessages(paramSessionId);
      setChatId(paramSessionId, {
        messages: stored.length > 0 ? stored : undefined,
      });
    } else {
      // New blank session
      const session = createSession();
      setChatId(session.id);
    }
  }, [initialMessage, paramSessionId, geo, setChatId]);

  const arrivalsFromMessages = useMemo(() => {
    let last: DisplayArrivalsInput | null = null;
    let lastToolCallId: string | null = null;
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (isToolUIPart(part)) {
          const tn =
            "toolName" in part
              ? String(part.toolName)
              : part.type.replace(/^tool-/, "");
          if (tn === "display_arrivals" && part.input) {
            last = part.input as DisplayArrivalsInput;
            lastToolCallId = part.toolCallId;
          }
        }
      }
    }
    // For URL-based inputs, resolve from fetchedArrivals
    if (last && !last.stops?.length && lastToolCallId) {
      const fetched = fetchedArrivals.current.get(lastToolCallId);
      if (fetched) {
        last = { ...fetched, url: last.url };
      }
    }
    return last;
  }, [messages, fetchedArrivals, fetchedArrivalsVersion]);

  const arrivalsData = arrivalsOverride ?? arrivalsFromMessages;
  const {
    lastRefreshedAt,
    refetch: refetchArrivals,
    isRefreshing,
  } = useArrivalsRefresh(arrivalsData, setArrivalsOverride);

  const mapData = useMapData(messages, arrivalsData);

  const userLocation =
    geo.latitude && geo.longitude
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  const handleLocationClick = useCallback(
    (pin: LocationPin) => {
      setSelectedPin(pin);
      setMapScreenData({ mapData, userLocation, selectedPin: pin });
      router.push(`${routePrefix}/map` as any);
    },
    [mapData, userLocation, setMapScreenData, router],
  );

  const handleOpenMap = useCallback(() => {
    setMapScreenData({ mapData, userLocation, selectedPin });
    router.push(`${routePrefix}/map` as any);
  }, [mapData, userLocation, selectedPin, setMapScreenData, router]);

  const handleArrivalsExpand = useCallback(
    (data: DisplayArrivalsInput) => {
      setSheetData({
        data,
        onLocationClick: handleLocationClick,
        lastRefreshedAt,
        onRefresh: refetchArrivals,
        isRefreshing,
      });
      router.push(`${routePrefix}/arrivals` as any);
    },
    [
      setSheetData,
      handleLocationClick,
      lastRefreshedAt,
      refetchArrivals,
      isRefreshing,
      router,
    ],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (!geoRequestedRef.current) {
        geoRequestedRef.current = true;
        geo.request();
      }
      setArrivalsOverride(null);
      sendMessage({ text });
    },
    [geo, sendMessage],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);

  const handleClear = useCallback(() => {
    // Create a new session and reset state
    const session = createSession();
    setChatId(session.id, { messages: [] });
    setArrivalsOverride(null);
    setSessionTitle(null);
    geoRequestedRef.current = false;
    titleGeneratedRef.current = false;
    prevStatusRef.current = "";
    toolCallFixedRef.current = false;
  }, [setChatId]);

  const isLoading = status === "streaming" || status === "submitted";
  const hasMapContent = mapData.stops.length > 0 || mapData.routes.length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: sessionTitle || dict.chat.headerTitle,
          headerLeft: () => (
            <Pressable
              onPress={handleBack}
              style={styles.headerButton}
              testID="back-btn"
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={theme.headerTint}
              />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleClear}
              style={styles.headerButton}
              testID="clear-btn"
            >
              <Ionicons name="add" size={22} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.backgroundSecondary }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={22}
      >
        {/* Messages */}
        <ChatMessagesList
          messages={messages}
          onLocationClick={handleLocationClick}
          isLoading={isLoading}
          arrivalsData={arrivalsData}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={refetchArrivals}
          isRefreshing={isRefreshing}
          onArrivalsExpand={handleArrivalsExpand}
        />

        {/* Error */}
        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>
              {error.message || dict.chat.errorFallback}
            </Text>
          </View>
        )}

        {/* Location permission banner */}
        {geo.permissionDenied && (
          <Pressable onPress={geo.openSettings} style={styles.locationBanner}>
            <Ionicons name="location-outline" size={16} color="#f59e0b" />
            <Text style={styles.locationBannerText}>
              {dict.chat.locationDenied}
            </Text>
            <Text style={styles.locationBannerAction}>
              {dict.chat.locationSettings}
            </Text>
          </Pressable>
        )}

        {/* Map button + Input */}
        <View
          style={[
            styles.inputArea,
            {
              paddingBottom: keyboardVisible ? 0 : insets.bottom,
              borderTopColor: theme.separatorLight,
            },
          ]}
        >
          <Pressable
            onPress={handleOpenMap}
            testID="view-map-btn"
            style={[
              styles.mapButton,
              { borderBottomColor: theme.separatorLight },
            ]}
          >
            <Ionicons name="map" size={18} color="#60a5fa" />
            <Text
              style={[styles.mapButtonText, { color: theme.textSecondary }]}
            >
              {hasMapContent
                ? `${mapData.stops.length} ${
                    mapData.stops.length !== 1
                      ? dict.chat.stops
                      : dict.chat.stop
                  }${
                    mapData.routes.length > 0
                      ? ` · ${mapData.routes.length} ${
                          mapData.routes.length !== 1
                            ? dict.chat.routes
                            : dict.chat.route
                        }`
                      : ""
                  }`
                : dict.chat.map}
            </Text>
            <View style={styles.mapButtonBadge}>
              <Text style={styles.mapButtonBadgeText}>{dict.chat.view}</Text>
            </View>
          </Pressable>

          <ChatInput
            onSubmit={handleSend}
            disabled={isLoading}
            placeholder={dict.chat.inputPlaceholder}
            compact
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  inputArea: {
    borderTopWidth: 1,
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  mapButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  mapButtonBadge: {
    backgroundColor: "#3b82f6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  mapButtonBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  errorBar: {
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
  },
  locationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(245,158,11,0.1)",
  },
  locationBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#f59e0b",
    fontWeight: "500",
  },
  locationBannerAction: {
    fontSize: 13,
    color: "#3b82f6",
    fontWeight: "600",
  },
});
