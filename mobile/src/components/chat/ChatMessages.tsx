import { useEffect, useRef, useMemo, useCallback } from "react";
import { View, FlatList, StyleSheet, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { isToolUIPart, type UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";
import { AssistantMessage } from "./AssistantMessage";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

interface ChatMessagesProps {
  messages: UIMessage[];
  onLocationClick?: (pin: LocationPin) => void;
  isLoading?: boolean;
  arrivalsData?: DisplayArrivalsInput | null;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface PreparedItem {
  key: string;
  type: "user" | "assistant" | "typing";
  text?: string;
  message?: UIMessage;
  toolPartsToRender?: Set<string>;
  lastArrivalsToolCallId?: string | null;
}

export function ChatMessagesList({
  messages,
  onLocationClick,
  isLoading,
  arrivalsData,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
}: ChatMessagesProps) {
  const listRef = useRef<FlatList<PreparedItem>>(null);
  const isNearBottomRef = useRef(true);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    isNearBottomRef.current = distanceFromBottom < 100;
  }, []);

  const items = useMemo(() => {
    const result: PreparedItem[] = [];

    // Build dedup maps
    const latestToolState = new Map<string, string>();
    let lastArrivalsToolCallId: string | null = null;
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (isToolUIPart(part)) {
          latestToolState.set(part.toolCallId, part.state);
          const tn =
            "toolName" in part
              ? String(part.toolName)
              : part.type.replace(/^tool-/, "");
          if (tn === "display_arrivals") {
            lastArrivalsToolCallId = part.toolCallId;
          }
        }
      }
    }
    const renderedTools = new Set<string>();

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      const toolPartsToRender = new Set<string>();
      if (msg.role === "assistant") {
        for (const part of msg.parts) {
          if (!isToolUIPart(part)) continue;
          if (renderedTools.has(part.toolCallId)) continue;
          if (latestToolState.get(part.toolCallId) !== part.state) continue;
          toolPartsToRender.add(part.toolCallId);
        }
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
      if (!hasContent) continue;

      if (msg.role === "user") {
        const text = textParts
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("");
        result.push({ key: `${msg.id}-${i}`, type: "user", text });
      } else {
        result.push({
          key: `${msg.id}-${i}`,
          type: "assistant",
          message: msg,
          toolPartsToRender,
          lastArrivalsToolCallId,
        });
      }
    }

    // Typing indicator
    if (
      isLoading &&
      messages.length > 0 &&
      messages[messages.length - 1]?.role === "user"
    ) {
      result.push({ key: "typing", type: "typing" });
    }

    return result;
  }, [messages, isLoading]);

  // Scroll to bottom when new items appear (only if already near bottom)
  useEffect(() => {
    if (items.length > 0 && isNearBottomRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [items.length]);

  // Scroll to bottom during streaming (only if already near bottom)
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      if (isNearBottomRef.current) {
        listRef.current?.scrollToEnd({ animated: false });
      }
    }, 150);
    return () => clearInterval(interval);
  }, [isLoading]);

  const renderItem = useCallback(
    ({ item }: { item: PreparedItem }) => {
      if (item.type === "user") {
        return <MessageBubble text={item.text!} />;
      }

      if (item.type === "typing") {
        return (
          <View style={styles.typingRow}>
            <View style={styles.typingDot} />
            <View style={[styles.typingDot, { opacity: 0.7 }]} />
            <View style={[styles.typingDot, { opacity: 0.4 }]} />
          </View>
        );
      }

      return (
        <AssistantMessage
          message={item.message!}
          toolPartsToRender={item.toolPartsToRender!}
          lastArrivalsToolCallId={item.lastArrivalsToolCallId ?? null}
          arrivalsData={arrivalsData}
          onLocationClick={onLocationClick}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
      );
    },
    [arrivalsData, onLocationClick, lastRefreshedAt, onRefresh, isRefreshing]
  );

  if (messages.length === 0) return null;

  return (
    <FlatList
      ref={listRef}
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.key}
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={100}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  typingRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#71717a",
  },
});
