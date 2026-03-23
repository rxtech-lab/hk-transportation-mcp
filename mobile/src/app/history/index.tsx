import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Animated,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  listSessions,
  deleteSession,
  listRouteTracking,
  deleteRouteTracking,
  type ChatSessionMeta,
  type RouteTrackingMeta,
} from "@/lib/db";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ── Segmented Control ───────────────────────────────────────────

function SegmentedControl({
  values,
  selectedIndex,
  onChange,
}: {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.inputBackground }]}>
      {values.map((label, i) => (
        <Pressable
          key={label}
          onPress={() => onChange(i)}
          style={[
            styles.segment,
            i === selectedIndex && [
              styles.segmentActive,
              { backgroundColor: theme.cardBackground },
            ],
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: theme.textSecondary },
              i === selectedIndex && {
                color: theme.text,
                fontWeight: "600",
              },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dict } = useI18n();
  const theme = useTheme();

  const [selectedTab, setSelectedTab] = useState(0);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [tracking, setTracking] = useState<RouteTrackingMeta[]>([]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useFocusEffect(
    useCallback(() => {
      setSessions(listSessions());
      setTracking(listRouteTracking());
    }, []),
  );

  // ── Chat history handlers ──

  const handleTap = useCallback(
    (session: ChatSessionMeta) => {
      router.push({
        pathname: "/history/chat",
        params: { sessionId: session.id },
      });
    },
    [router],
  );

  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    swipeableRefs.current.get(id)?.close();
    swipeableRefs.current.delete(id);
  }, []);

  const renderChatRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      _dragX: Animated.AnimatedInterpolation<number>,
      id: string,
    ) => (
      <Pressable
        style={styles.deleteAction}
        onPress={() => handleDeleteSession(id)}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteText}>{dict.history.delete}</Text>
      </Pressable>
    ),
    [handleDeleteSession, dict],
  );

  const renderChatItem = useCallback(
    ({ item, index }: { item: ChatSessionMeta; index: number }) => (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={(progress, dragX) =>
          renderChatRightActions(progress, dragX, item.id)
        }
        overshootRight={false}
      >
        <Pressable
          onPress={() => handleTap(item)}
          testID={`history-session-${index}`}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: theme.background,
              borderBottomColor: theme.separator,
            },
            pressed && { backgroundColor: theme.inputBackground },
          ]}
        >
          <View
            style={[styles.rowIcon, { backgroundColor: theme.inputBackground }]}
          >
            <Ionicons
              name="chatbubble-outline"
              size={18}
              color={theme.textTertiary}
            />
          </View>
          <View style={styles.rowContent}>
            <Text
              style={[styles.rowTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.title || dict.history.untitled}
            </Text>
            <Text style={[styles.rowTime, { color: theme.textTertiary }]}>
              {formatRelativeTime(item.updatedAt)}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.chevronColor}
          />
        </Pressable>
      </Swipeable>
    ),
    [handleTap, renderChatRightActions, dict, theme],
  );

  // ── Tracking history handlers ──

  const handleDeleteTracking = useCallback(
    (route: string, destination: string) => {
      const key = `${route}|${destination}`;
      deleteRouteTracking(route, destination);
      setTracking((prev) =>
        prev.filter((t) => `${t.route}|${t.destination}` !== key),
      );
      swipeableRefs.current.get(key)?.close();
      swipeableRefs.current.delete(key);
    },
    [],
  );

  const renderTrackingRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      _dragX: Animated.AnimatedInterpolation<number>,
      route: string,
      destination: string,
    ) => (
      <Pressable
        style={styles.deleteAction}
        onPress={() => handleDeleteTracking(route, destination)}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteText}>{dict.history.delete}</Text>
      </Pressable>
    ),
    [handleDeleteTracking, dict],
  );

  const renderTrackingItem = useCallback(
    ({ item }: { item: RouteTrackingMeta }) => {
      const key = `${item.route}|${item.destination}`;
      return (
        <Swipeable
          ref={(ref) => {
            if (ref) swipeableRefs.current.set(key, ref);
          }}
          renderRightActions={(progress, dragX) =>
            renderTrackingRightActions(
              progress,
              dragX,
              item.route,
              item.destination,
            )
          }
          overshootRight={false}
        >
          <View
            style={[
              styles.row,
              {
                backgroundColor: theme.background,
                borderBottomColor: theme.separator,
              },
            ]}
          >
            <View style={styles.trackingBadge}>
              <Ionicons name="bus" size={12} color="#fff" />
              <Text style={styles.trackingBadgeText}>{item.route}</Text>
            </View>
            <View style={styles.rowContent}>
              <Text
                style={[styles.rowTitle, { color: theme.text }]}
                numberOfLines={1}
              >
                {item.destination}
              </Text>
              <Text style={[styles.rowTime, { color: theme.textTertiary }]}>
                {dict.history.trackingCount.replace("{0}", String(item.count))}
                {"  ·  "}
                {formatRelativeTime(item.lastTrackedAt)}
              </Text>
            </View>
          </View>
        </Swipeable>
      );
    },
    [renderTrackingRightActions, dict, theme],
  );

  // ── Render ──

  const headerHeight = insets.top + 44;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: headerHeight }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {dict.history.title}
        </Text>
        <SegmentedControl
          values={[dict.history.chatHistory, dict.history.trackingHistory]}
          selectedIndex={selectedTab}
          onChange={setSelectedTab}
        />
      </View>

      {selectedTab === 0 ? (
        sessions.length === 0 ? (
          <View
            style={[
              styles.empty,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={theme.textTertiary}
            />
            <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
              {dict.history.empty}
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            renderItem={renderChatItem}
            contentContainerStyle={{ paddingBottom: insets.bottom }}
            style={[styles.list, { backgroundColor: theme.background }]}
          />
        )
      ) : tracking.length === 0 ? (
        <View
          style={[
            styles.empty,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Ionicons
            name="navigate-outline"
            size={48}
            color={theme.textTertiary}
          />
          <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
            {dict.history.trackingEmpty}
          </Text>
        </View>
      ) : (
        <FlatList
          data={tracking}
          keyExtractor={(item) => `${item.route}|${item.destination}`}
          renderItem={renderTrackingItem}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          style={[styles.list, { backgroundColor: theme.background }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.24,
  },
  rowTime: {
    fontSize: 13,
    marginTop: 2,
  },
  deleteAction: {
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    gap: 4,
  },
  deleteText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  // Segmented control
  segmented: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
  },
  // Tracking badge
  trackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#34C759",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  trackingBadgeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
