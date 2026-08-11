import { use, useContext, useEffect, useRef, useMemo, useCallback } from "react";
import { FlatList, StyleSheet, View, Animated, Easing, Keyboard, Platform, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { isToolUIPart, type UIMessage } from "ai";
import { useRouter, useSegments } from "expo-router";
import { HeaderHeightContext } from "@react-navigation/elements";
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
  lastRouteToolCallId?: string | null;
}

/** Vertical padding of the list content container (see styles.content). */
const CONTENT_PADDING = 16;
/** Gap left above the pinned user message so it isn't flush with the top edge. */
const PIN_TOP_GAP = 8;

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
  const {
    fetchedArrivals,
    fetchedArrivalsVersion,
    fetchedRoutes,
    fetchedRoutesVersion,
  } = useContext(ChatStreamContext);

  const handleToolPress = useCallback((info: ToolCallInfo) => {
    setToolCallData(info);
    router.push(`${routePrefix}/tool-call` as any);
  }, [setToolCallData, router, routePrefix]);

  // --- Pin the latest user message to the top -------------------------------
  // The list keeps a "blank" spacer below the last turn, sized so that
  // (last turn + spacer) exactly fills the viewport. Scrolling to the end then
  // lands the user message at the top. As the assistant streams, the turn grows
  // and the spacer shrinks to 0, after which scrolling to the end just follows
  // the stream as usual. Driven by an Animated.Value so per-frame height
  // updates don't re-render the list.
  const blankSize = useRef(new Animated.Value(0)).current;
  const heightsRef = useRef(new Map<string, number>());
  const itemsRef = useRef<PreparedItem[]>([]);
  // The screens use headerTransparent, so the list frame runs behind the header
  // and iOS adds no inset for it. We clear it ourselves with paddingTop, and
  // subtract it here because scrollToEnd aligns content with the frame bottom —
  // only (frame - header) is actually visible.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const headerHeightRef = useRef(headerHeight);
  headerHeightRef.current = headerHeight;

  const recomputeBlankSize = useCallback(() => {
    const viewport = layoutHeightRef.current - headerHeightRef.current;
    const list = itemsRef.current;
    if (viewport <= 0 || list.length === 0) {
      blankSize.setValue(0);
      return;
    }

    let lastUserIndex = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].type === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) {
      blankSize.setValue(0);
      return;
    }

    // Height of everything from the last user message to the end of the list.
    let turnHeight = 0;
    for (let i = lastUserIndex; i < list.length; i++) {
      turnHeight += heightsRef.current.get(list[i].key) ?? 0;
    }

    blankSize.setValue(
      Math.max(0, viewport - turnHeight - CONTENT_PADDING - PIN_TOP_GAP)
    );
  }, [blankSize]);

  const onItemLayout = useCallback(
    (key: string, height: number) => {
      const prev = heightsRef.current.get(key);
      if (prev !== undefined && Math.abs(prev - height) < 0.5) return;
      heightsRef.current.set(key, height);
      recomputeBlankSize();
    },
    [recomputeBlankSize]
  );

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      layoutHeightRef.current = e.nativeEvent.layout.height;
      recomputeBlankSize();
    },
    [recomputeBlankSize]
  );

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
    let lastRouteToolCallId: string | null = null;
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
          if (tn === "display_route") {
            lastRouteToolCallId = part.toolCallId;
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
          lastRouteToolCallId,
        });
      }
    }

    // Typing indicator — keep visible for the whole stream, not just before
    // the assistant's first chunk arrives
    if (isLoading) {
      result.push({ key: "typing", type: "typing" });
    }

    return result;
  }, [messages, isLoading]);

  // Keep the measurement cache in sync with the rendered items
  useEffect(() => {
    itemsRef.current = items;
    const live = new Set(items.map((i) => i.key));
    for (const key of heightsRef.current.keys()) {
      if (!live.has(key)) heightsRef.current.delete(key);
    }
    recomputeBlankSize();
  }, [items, recomputeBlankSize]);

  // Pin the newest user message to the top as soon as it is sent
  const lastUserKey = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].type === "user") return items[i].key;
    }
    return null;
  }, [items]);

  useEffect(() => {
    if (!lastUserKey) return;
    isNearBottomRef.current = true;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [lastUserKey]);

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
      let content;
      if (item.type === "user") {
        content = <MessageBubble text={item.text!} />;
      } else if (item.type === "typing") {
        content = <TypingIndicator />;
      } else {
        content = (
          <AssistantMessage
            message={item.message!}
            toolPartsToRender={item.toolPartsToRender!}
            lastArrivalsToolCallId={item.lastArrivalsToolCallId ?? null}
            arrivalsData={arrivalsData}
            fetchedArrivals={fetchedArrivals.current}
            lastRouteToolCallId={item.lastRouteToolCallId ?? null}
            fetchedRoutes={fetchedRoutes.current}
            onLocationClick={onLocationClick}
            lastRefreshedAt={lastRefreshedAt}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            onArrivalsExpand={onArrivalsExpand}
            onToolPress={handleToolPress}
          />
        );
      }

      return (
        <View
          onLayout={(e) => onItemLayout(item.key, e.nativeEvent.layout.height)}
        >
          {content}
        </View>
      );
    },
    [arrivalsData, fetchedArrivalsVersion, fetchedRoutesVersion, onLocationClick, lastRefreshedAt, onRefresh, isRefreshing, onArrivalsExpand, handleToolPress, onItemLayout]
  );

  const listFooter = useMemo(
    () => <Animated.View style={{ height: blankSize }} />,
    [blankSize]
  );

  return (
    <FlatList
      ref={listRef}
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.key}
      ListFooterComponent={listFooter}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: headerHeight + CONTENT_PADDING },
      ]}
      contentInsetAdjustmentBehavior="never"
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
