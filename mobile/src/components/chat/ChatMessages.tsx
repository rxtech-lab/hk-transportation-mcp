import { use, useContext, useEffect, useRef, useMemo, useCallback } from "react";
import { FlatList, StyleSheet, View, Animated, Easing, Keyboard, Platform, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { isToolUIPart, type UIMessage } from "ai";
import { useRouter, useSegments } from "expo-router";
import { MessageBubble } from "./MessageBubble";
import { AssistantMessage, type ToolCallInfo } from "./AssistantMessage";
import { ToolCallSheetContext } from "@/app/(transport)/_ctx";
import { ChatStreamContext } from "@/contexts/ChatStreamContext";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

interface ChatMessagesProps {
  messages: UIMessage[];
  onLocationClick?: (pin: LocationPin) => void;
  isLoading?: boolean;
  arrivalsData?: DisplayArrivalsInput | null;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onArrivalsExpand?: (data: DisplayArrivalsInput) => void;
}

interface PreparedItem {
  key: string;
  type: "user" | "assistant" | "typing";
  text?: string;
  message?: UIMessage;
  toolPartsToRender?: Set<string>;
  lastArrivalsToolCallId?: string | null;
}

function TypingIndicator() {
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [anims]);

  return (
    <View style={styles.typingRow}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -4],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export function ChatMessagesList({
  messages,
  onLocationClick,
  isLoading,
  arrivalsData,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
  onArrivalsExpand,
}: ChatMessagesProps) {
  const listRef = useRef<FlatList<PreparedItem>>(null);
  const isNearBottomRef = useRef(true);
  const isScrollableRef = useRef(false);
  const layoutHeightRef = useRef(0);
  const hasScrolledInitialRef = useRef(false);
  const router = useRouter();
  const segments = useSegments();
  const routePrefix = segments[0] === "history" ? "/history" : "/(transport)";
  const { setToolCallData } = use(ToolCallSheetContext);
  const { fetchedArrivals, fetchedArrivalsVersion } = useContext(ChatStreamContext);

  const handleToolPress = useCallback((info: ToolCallInfo) => {
    setToolCallData(info);
    router.push(`${routePrefix}/tool-call` as any);
  }, [setToolCallData, router, routePrefix]);

  const onLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    layoutHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    isScrollableRef.current = h > layoutHeightRef.current;
    // Scroll to bottom on first content load (e.g. restored session)
    if (!hasScrolledInitialRef.current && h > layoutHeightRef.current && layoutHeightRef.current > 0) {
      hasScrolledInitialRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
      }, 50);
    }
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    isScrollableRef.current = contentSize.height > layoutMeasurement.height;
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

  // Scroll to bottom when keyboard appears
  useEffect(() => {
    const event = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(event, () => {
      if (isScrollableRef.current) {
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });
    return () => sub.remove();
  }, []);

  // Scroll to bottom when new items appear (only if scrollable and near bottom)
  useEffect(() => {
    if (items.length > 0 && isScrollableRef.current && isNearBottomRef.current) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [items.length]);

  // Scroll to bottom during streaming (only if scrollable and near bottom)
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      if (isScrollableRef.current && isNearBottomRef.current) {
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
        return <TypingIndicator />;
      }

      return (
        <AssistantMessage
          message={item.message!}
          toolPartsToRender={item.toolPartsToRender!}
          lastArrivalsToolCallId={item.lastArrivalsToolCallId ?? null}
          arrivalsData={arrivalsData}
          fetchedArrivals={fetchedArrivals.current}
          onLocationClick={onLocationClick}
          lastRefreshedAt={lastRefreshedAt}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          onArrivalsExpand={onArrivalsExpand}
          onToolPress={handleToolPress}
        />
      );
    },
    [arrivalsData, fetchedArrivalsVersion, onLocationClick, lastRefreshedAt, onRefresh, isRefreshing, onArrivalsExpand, handleToolPress]
  );

  return (
    <FlatList
      ref={listRef}
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.key}
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      onLayout={onLayout}
      onContentSizeChange={onContentSizeChange}
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
