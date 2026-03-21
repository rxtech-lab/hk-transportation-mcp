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

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dict } = useI18n();
  const theme = useTheme();
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
        pathname: "/history/chat",
        params: { sessionId: session.id },
      });
    },
    [router],
  );

  const handleDelete = useCallback((id: string) => {
    deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    swipeableRefs.current.get(id)?.close();
    swipeableRefs.current.delete(id);
  }, []);

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
    ({ item, index }: { item: ChatSessionMeta; index: number }) => (
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
    [handleTap, renderRightActions, dict],
  );

  if (sessions.length === 0) {
    return (
      <View
        style={[styles.empty, { backgroundColor: theme.backgroundSecondary }]}
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
    );
  }

  return (
    <FlatList
      data={sessions}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{
        paddingTop: insets.top + 44,
        paddingBottom: insets.bottom,
      }}
      style={[styles.list, { backgroundColor: theme.background }]}
    />
  );
}

const styles = StyleSheet.create({
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
});
