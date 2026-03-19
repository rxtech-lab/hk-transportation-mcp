import { useState, useCallback, useRef, useEffect, useMemo, use } from "react";
import {
  View,
  StyleSheet,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  isToolUIPart,
} from "ai";
import { Ionicons } from "@expo/vector-icons";

import { TransportMap } from "@/components/map/TransportMap";
import { ChatMessagesList } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import {
  LandingHeader,
  SuggestionChips,
} from "@/components/landing/LandingView";
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
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

export default function MainScreen() {
  const insets = useSafeAreaInsets();
  const [isLanding, setIsLanding] = useState(true);
  const [arrivalsOverride, setArrivalsOverride] =
    useState<DisplayArrivalsInput | null>(null);
  const [selectedPin, setSelectedPin] = useState<LocationPin | null>(null);
  const [showMap, setShowMap] = useState(false);
  const geo = useGeolocation();
  const { dict } = useI18n();
  const geoRequestedRef = useRef(false);
  const geoRef = useRef(geo);
  geoRef.current = geo;

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

  // Restore stored messages
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    loadStoredMessages().then((stored) => {
      if (stored.length > 0) {
        setMessages(stored);
        setIsLanding(false);
      }
    });
  }, [setMessages]);

  const handleLocationClick = useCallback((pin: LocationPin) => {
    setSelectedPin(pin);
    setShowMap(true);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      console.log(
        "[mobile] handleSend called with:",
        text,
        "current messages count:",
        messages.length,
      );
      if (!geoRequestedRef.current) {
        geoRequestedRef.current = true;
        geo.request();
      }
      if (isLanding) setIsLanding(false);
      setArrivalsOverride(null);
      sendMessage({ text });
    },
    [isLanding, geo, sendMessage],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setArrivalsOverride(null);
    clearChatStorage();
    setIsLanding(true);
    setShowMap(false);
    geoRequestedRef.current = false;
  }, [setMessages]);

  const isLoading = status === "streaming" || status === "submitted";
  const hasMapContent = mapData.stops.length > 0 || mapData.routes.length > 0;
  const userLocation =
    geo.latitude && geo.longitude
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  if (isLanding) {
    return (
      <View
        style={[
          styles.root,
          styles.landingCenter,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
        ]}
      >
        <LandingHeader />
        <ChatInput
          onSubmit={handleSend}
          placeholder={dict.chat.inputPlaceholder}
        />
        <SuggestionChips onSuggestion={handleSend} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="bus" size={15} color="#fff" />
          </View>
          <Text style={styles.headerTitle}>{dict.chat.headerTitle}</Text>
        </View>
        <Pressable onPress={handleClear} style={styles.headerButton}>
          <Ionicons name="add" size={18} color="#a1a1aa" />
        </Pressable>
      </View>

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
        {/* Map button bar */}
        <Pressable onPress={() => setShowMap(true)} style={styles.mapButton}>
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

      {/* Map modal */}
      <Modal
        visible={showMap}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMap(false)}
      >
        <View style={styles.mapModal}>
          <View style={styles.mapModalHeader}>
            <Text style={styles.mapModalTitle}>{dict.map.title}</Text>
            <Pressable
              onPress={() => setShowMap(false)}
              style={styles.mapModalClose}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <View style={styles.mapContainer}>
            <TransportMap
              mapData={mapData}
              userLocation={userLocation}
              selectedPin={selectedPin}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  landingCenter: {
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#09090b",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
    letterSpacing: -0.3,
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
  mapModal: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  mapModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  mapModalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
  mapModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  mapContainer: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
});
