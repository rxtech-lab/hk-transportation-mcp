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

import { listSessions, deleteSession, type ChatSessionMeta } from "@/lib/db";
import { useI18n } from "@/lib/i18n/i18n-provider";

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

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dict } = useI18n();
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  useFocusEffect(
    useCallback(() => {
      setSessions(listSessions());
    }, []),
  );

  const handleTap = useCallback(
    (session: ChatSessionMeta) => {
      router.push({
        pathname: "/(transport)/chat",
        params: { sessionId: session.id },
      });
    },
    [router],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      swipeableRefs.current.get(id)?.close();
      swipeableRefs.current.delete(id);
    },
    [],
  );

  const renderRightActions = useCallback(
    (
      _progress: Animated.AnimatedInterpolation<number>,
      _dragX: Animated.AnimatedInterpolation<number>,
      id: string,
    ) => (
      <Pressable style={styles.deleteAction} onPress={() => handleDelete(id)}>
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteText}>{dict.history.delete}</Text>
      </Pressable>
    ),
    [handleDelete, dict],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatSessionMeta }) => (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
        }}
        renderRightActions={(progress, dragX) =>
          renderRightActions(progress, dragX, item.id)
        }
        overshootRight={false}
      >
        <Pressable
          onPress={() => handleTap(item)}
          style={({ pressed }) => [
            styles.row,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="chatbubble-outline" size={18} color="#8E8E93" />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title || dict.history.untitled}
            </Text>
            <Text style={styles.rowTime}>
              {formatRelativeTime(item.updatedAt)}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color="rgba(235,235,245,0.3)"
          />
        </Pressable>
      </Swipeable>
    ),
    [handleTap, renderRightActions, dict],
  );

  if (sessions.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="chatbubbles-outline" size={48} color="#3A3A3C" />
        <Text style={styles.emptyText}>{dict.history.empty}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sessions}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#09090b",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(84,84,88,0.65)",
    gap: 12,
  },
  rowPressed: {
    backgroundColor: "rgba(118,118,128,0.12)",
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(118,118,128,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#fff",
    letterSpacing: -0.24,
  },
  rowTime: {
    fontSize: 13,
    color: "#8E8E93",
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
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: "#8E8E93",
  },
});
