import { useState, useCallback, useRef, useEffect, useMemo, use } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  isToolUIPart,
} from "ai";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";

import { ChatMessagesList } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useArrivalsRefresh } from "@/hooks/useArrivalsRefresh";
import {
  loadStoredMessages,
  useChatStorage,
  clearChatStorage,
} from "@/hooks/useChatStorage";
import { useMapData } from "@/hooks/useMapData";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { fetch as expoFetch } from "expo/fetch";
import { FRONTEND_URL } from "@/lib/config";
import { TabBarContext } from "@/app/_layout";
import { MapDataContext } from "./_ctx";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { initialMessage } = useLocalSearchParams<{
    initialMessage?: string;
  }>();
  const { setIsTabBarHidden } = use(TabBarContext);
  const { setData: setMapScreenData } = use(MapDataContext);
  const [arrivalsOverride, setArrivalsOverride] =
    useState<DisplayArrivalsInput | null>(null);
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null);
  const geo = useGeolocation();
  const { dict } = useI18n();
  const geoRequestedRef = useRef(false);
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const initialMessageSentRef = useRef(false);

  // Hide tab bar on mount, restore on unmount
  useEffect(() => {
    setIsTabBarHidden(true);
    return () => setIsTabBarHidden(false);
  }, [setIsTabBarHidden]);

  const { messages, sendMessage, status, setMessages, error, addToolOutput } =
    useChat({
      id: "hk-transport",
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      transport: new DefaultChatTransport({
        api: `${FRONTEND_URL}/api/chat`,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
      }),
      onToolCall({ toolCall }) {
        if (toolCall.toolName === "display_arrivals") {
          addToolOutput({
            tool: "display_arrivals" as never,
            toolCallId: toolCall.toolCallId,
            output: "Arrival card displayed to user.",
          });
        }
        if (toolCall.toolName === "get_user_location") {
          const g = geoRef.current;
          if (g.latitude && g.longitude) {
            addToolOutput({
              tool: "get_user_location" as never,
              toolCallId: toolCall.toolCallId,
              output: JSON.stringify({
                latitude: g.latitude,
                longitude: g.longitude,
              }),
            });
          } else {
            geo.request().then((coords) => {
              if (coords) {
                addToolOutput({
                  tool: "get_user_location" as never,
                  toolCallId: toolCall.toolCallId,
                  output: JSON.stringify({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                  }),
                });
              } else {
                addToolOutput({
                  tool: "get_user_location" as never,
                  toolCallId: toolCall.toolCallId,
                  output: JSON.stringify({
                    error:
                      "Location unavailable. The user may have denied location permission.",
                  }),
                });
              }
            });
          }
        }
      },
    });

  useChatStorage(messages);

  // Restore stored messages or send initial message
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    loadStoredMessages().then((stored) => {
      if (stored.length > 0) {
        setMessages(stored);
      } else if (initialMessage && !initialMessageSentRef.current) {
        initialMessageSentRef.current = true;
        if (!geoRequestedRef.current) {
          geoRequestedRef.current = true;
          geo.request();
        }
        sendMessage({ text: initialMessage });
      }
    });
  }, [setMessages, initialMessage, sendMessage, geo]);

  const arrivalsFromMessages = useMemo(() => {
    let last: DisplayArrivalsInput | null = null;
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
          }
        }
      }
    }
    return last;
  }, [messages]);

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
      router.push("/(transport)/map");
    },
    [mapData, userLocation, setMapScreenData, router],
  );

  const handleOpenMap = useCallback(() => {
    setMapScreenData({ mapData, userLocation, selectedPin });
    router.push("/(transport)/map");
  }, [mapData, userLocation, selectedPin, setMapScreenData, router]);

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
    setMessages([]);
    setArrivalsOverride(null);
    clearChatStorage();
    geoRequestedRef.current = false;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [setMessages, router]);

  const isLoading = status === "streaming" || status === "submitted";
  const hasMapContent = mapData.stops.length > 0 || mapData.routes.length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={handleBack} style={styles.headerButton}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleClear} style={styles.headerButton}>
              <Ionicons name="add" size={22} color="#a1a1aa" />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
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
        />

        {/* Error */}
        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>
              {error.message || dict.chat.errorFallback}
            </Text>
          </View>
        )}

        {/* Map button + Input */}
        <View style={[styles.inputArea, { paddingBottom: insets.bottom + 4 }]}>
          <Pressable onPress={handleOpenMap} style={styles.mapButton}>
            <Ionicons name="map" size={18} color="#60a5fa" />
            <Text style={styles.mapButtonText}>
              {hasMapContent
                ? `${mapData.stops.length} ${
                    mapData.stops.length !== 1 ? dict.chat.stops : dict.chat.stop
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
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090b",
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
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#09090b",
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  mapButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#d4d4d8",
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
});
