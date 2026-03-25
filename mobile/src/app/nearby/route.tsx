import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { useLocalizedStopName } from "@/lib/i18n/i18n-provider";
import { useRouteStops, type RouteStopInfo } from "@/hooks/useRouteStops";
import { useStopEta } from "@/hooks/useStopEta";
import { EtaPill } from "@/components/arrivals/EtaPill";
import {
  startTracking,
  stopTracking,
  getTrackedInfo,
} from "@/lib/live-activity";
import * as Haptics from "expo-haptics";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function StopRow({
  stop,
  route,
  isFirst,
  isLast,
  isCurrent,
  theme,
  displayName,
  onLayoutCurrent,
}: {
  stop: RouteStopInfo;
  route: string;
  isFirst: boolean;
  isLast: boolean;
  isCurrent: boolean;
  theme: ReturnType<typeof useTheme>;
  displayName: string;
  onLayoutCurrent?: (y: number) => void;
}) {
  const [expanded, setExpanded] = useState(isCurrent);
  const { stopData, isLoading } = useStopEta(stop.id, route, expanded);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const arrival = stopData?.arrivals?.find((a) => a.route === route);

  return (
    <Pressable
      onPress={toggle}
      onLayout={
        isCurrent && onLayoutCurrent
          ? (e) => onLayoutCurrent(e.nativeEvent.layout.y)
          : undefined
      }
      style={({ pressed }) => [
        styles.stopRow,
        { backgroundColor: theme.cardBackground },
        pressed && styles.stopRowPressed,
      ]}
    >
      {/* Timeline indicator */}
      <View style={styles.timeline}>
        {!isFirst && (
          <View style={[styles.lineTop, { backgroundColor: "#007AFF" }]} />
        )}
        <View
          style={[
            styles.dot,
            isCurrent
              ? { backgroundColor: "#007AFF", borderColor: "#007AFF" }
              : {
                  backgroundColor: theme.cardBackground,
                  borderColor: "#007AFF",
                },
          ]}
        />
        {!isLast && (
          <View style={[styles.lineBottom, { backgroundColor: "#007AFF" }]} />
        )}
      </View>

      {/* Stop info */}
      <View style={styles.stopInfo}>
        <View style={styles.stopHeader}>
          <Text
            style={[
              styles.stopName,
              { color: theme.text },
              isCurrent && styles.stopNameCurrent,
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.textSecondary}
          />
        </View>

        {/* Expanded ETA section */}
        {expanded && (
          <View style={styles.etaSection}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : arrival && arrival.etas.length > 0 ? (
              <View style={styles.etaRow}>
                {arrival.etas.map((eta, k) => (
                  <EtaPill
                    key={k}
                    minutes={eta.minutes}
                    remarks={eta.remarks}
                  />
                ))}
              </View>
            ) : (
              <Text style={[styles.noEta, { color: theme.textSecondary }]}>
                No arrivals
              </Text>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function RouteDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const getStopName = useLocalizedStopName();
  const params = useLocalSearchParams<{
    route: string;
    stopId: string;
    destination: string;
    operator: string;
  }>();

  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const cardYRef = useRef(0);
  const hasScrolledRef = useRef(false);

  // Track/untrack state
  const [trackedKey, setTrackedKey] = useState<string | null>(() => {
    const info = getTrackedInfo();
    return info ? `${info.route}:${info.stopId}` : null;
  });
  const currentKey = params.route && params.stopId ? `${params.route}:${params.stopId}` : null;
  const isTracked = currentKey !== null && trackedKey === currentKey;

  const handleToggleTracking = useCallback(async () => {
    if (!params.route || !params.stopId) return;
    if (isTracked) {
      await stopTracking();
      setTrackedKey(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      const currentStop = stops.find((s) => s.id === currentStopId);
      const ok = await startTracking({
        route: params.route,
        stopName: currentStop ? getStopName(currentStop) : params.stopId,
        stopId: params.stopId,
        destination: localizedDestination ?? params.destination ?? "",
        operator: params.operator ?? "",
        etas: [],
      });
      if (ok) {
        setTrackedKey(currentKey);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, [isTracked, params, currentKey, stops, currentStopId, getStopName, localizedDestination]);

  const handleCurrentStopLayout = useCallback((y: number) => {
    if (hasScrolledRef.current) return;
    hasScrolledRef.current = true;
    // Delay slightly to ensure ScrollView is fully laid out
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: cardYRef.current + y - 100,
        animated: true,
      });
    }, 300);
  }, []);

  const { stops, destination, matchedStopId, isLoading } = useRouteStops(
    params.route ?? null,
    params.stopId ?? null,
  );

  const currentStopId = matchedStopId ?? params.stopId;

  // Use localized destination from last stop if available
  const localizedDestination = stops.length > 0
    ? getStopName(stops[stops.length - 1])
    : destination;

  const title = params.route
    ? localizedDestination
      ? `${params.route} → ${localizedDestination}`
      : params.route
    : "";

  const headerRight = useCallback(
    () => (
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Ionicons name="close" size={22} color={theme.textSecondary} />
      </Pressable>
    ),
    [router, theme],
  );

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title, headerRight }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title, headerRight }} />
      <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + 10, paddingBottom: 72 },
        ]}
      >
        <View
          style={[styles.card, { backgroundColor: theme.cardBackground }]}
          onLayout={(e) => {
            cardYRef.current = e.nativeEvent.layout.y;
          }}
        >
          {stops.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="bus-outline" size={48} color="#8E8E93" />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No stops found
              </Text>
            </View>
          ) : (
            stops.map((item, index) => (
              <StopRow
                key={`${item.id}-${index}`}
                stop={item}
                route={params.route ?? ""}
                isFirst={index === 0}
                isLast={index === stops.length - 1}
                isCurrent={item.id === currentStopId}
                theme={theme}
                displayName={getStopName(item)}
                onLayoutCurrent={
                  item.id === currentStopId
                    ? handleCurrentStopLayout
                    : undefined
                }
              />
            ))
          )}
        </View>
      </ScrollView>
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? 24 : 28 }]}>
        <Pressable
          onPress={handleToggleTracking}
          style={({ pressed }) => [
            styles.trackButton,
            isTracked && styles.trackButtonActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name={isTracked ? "radio" : "radio-outline"}
            size={18}
            color="#fff"
          />
          <Text style={styles.trackButtonText}>
            {isTracked ? "Stop Tracking" : "Track Live Activity"}
          </Text>
        </Pressable>
      </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 60,
  },
  list: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 16,
    overflow: "hidden",
    paddingVertical: 4,
  },
  stopRow: {
    flexDirection: "row",
    paddingRight: 12,
  },
  stopRowPressed: {
    opacity: 0.7,
  },
  timeline: {
    width: 32,
    alignItems: "center",
  },
  lineTop: {
    width: 2,
    flex: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  lineBottom: {
    width: 2,
    flex: 1,
  },
  stopInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(142,142,147,0.2)",
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stopName: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 8,
  },
  stopNameCurrent: {
    fontWeight: "700",
    color: "#007AFF",
  },
  etaSection: {
    marginTop: 8,
    minHeight: 28,
  },
  etaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  noEta: {
    fontSize: 13,
    fontStyle: "italic",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  trackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#007AFF",
  },
  trackButtonActive: {
    backgroundColor: "#FF3B30",
  },
  trackButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
