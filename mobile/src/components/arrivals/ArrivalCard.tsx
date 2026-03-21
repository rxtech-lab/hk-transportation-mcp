import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EtaPill } from "./EtaPill";
import { useTheme } from "@/hooks/use-theme";
import { useLocalizedStopName, useLocalizedDestination } from "@/lib/i18n/i18n-provider";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";
import {
  startTracking,
  stopTracking,
  getTrackedInfo,
} from "@/lib/live-activity";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ArrivalCard({
  data,
  onLocationClick,
  stale,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
  onHeaderPress,
}: {
  data: DisplayArrivalsInput;
  onLocationClick?: (pin: LocationPin) => void;
  stale?: boolean;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onHeaderPress?: () => void;
}) {
  const theme = useTheme();
  const getStopName = useLocalizedStopName();
  const getDestination = useLocalizedDestination();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevRefreshing = useRef(isRefreshing);
  const [trackedKey, setTrackedKey] = useState<string | null>(() => {
    const info = getTrackedInfo();
    return info ? `${info.route}:${info.stopId}` : null;
  });

  useEffect(() => {
    if (prevRefreshing.current !== isRefreshing) {
      prevRefreshing.current = isRefreshing;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [isRefreshing, fadeAnim]);

  const handleRouteBadgePress = useCallback(
    (stop: (typeof data.stops)[number], arrival: (typeof data.stops)[number]["arrivals"][number]) => {
      const key = `${arrival.route}:${stop.id}`;
      const isCurrentlyTracked = trackedKey === key;
      const localizedName = getStopName(stop);
      const localizedDest = getDestination(arrival);

      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: `${arrival.route} → ${localizedDest}`,
            message: `at ${localizedName}`,
            options: isCurrentlyTracked
              ? ["Stop Tracking", "Cancel"]
              : ["Track in Live Activity", "Cancel"],
            cancelButtonIndex: 1,
            destructiveButtonIndex: isCurrentlyTracked ? 0 : undefined,
          },
          async (buttonIndex) => {
            if (buttonIndex === 0) {
              if (isCurrentlyTracked) {
                await stopTracking();
                setTrackedKey(null);
              } else {
                const ok = await startTracking({
                  route: arrival.route,
                  stopName: localizedName,
                  stopId: stop.id,
                  destination: localizedDest,
                  etas: arrival.etas,
                });
                if (ok) setTrackedKey(key);
              }
            }
          },
        );
      } else {
        Alert.alert(
          `${arrival.route} → ${localizedDest}`,
          `at ${localizedName}`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: isCurrentlyTracked ? "Stop Tracking" : "Track in Live Activity",
              style: isCurrentlyTracked ? "destructive" : "default",
              onPress: async () => {
                if (isCurrentlyTracked) {
                  await stopTracking();
                  setTrackedKey(null);
                } else {
                  const ok = await startTracking({
                    route: arrival.route,
                    stopName: localizedName,
                    stopId: stop.id,
                    destination: localizedDest,
                    etas: arrival.etas,
                  });
                  if (ok) setTrackedKey(key);
                }
              },
            },
          ],
        );
      }
    },
    [trackedKey, data, getStopName, getDestination],
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground }, stale && styles.stale]}>
      {/* Header: title + refresh */}
      {(data.title || onRefresh) && (
        <View style={[styles.header, { borderBottomColor: theme.separator }]}>
          <Pressable
            style={styles.headerTop}
            onPress={onHeaderPress}
            disabled={!onHeaderPress}
          >
            {data.title ? (
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                {data.title}
              </Text>
            ) : null}
            {onHeaderPress && (
              <Ionicons name="expand-outline" size={16} color={theme.chevronColor} />
            )}
          </Pressable>
          {onRefresh && (
            <View style={styles.refreshRow}>
              {lastRefreshedAt ? (
                <Animated.Text style={[styles.refreshTime, { color: theme.chevronColor, opacity: fadeAnim }]}>
                  Updated {formatTime(lastRefreshedAt)}
                </Animated.Text>
              ) : null}
              <Pressable
                onPress={onRefresh}
                disabled={isRefreshing}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.refreshButton,
                  pressed && styles.refreshButtonPressed,
                ]}
              >
                <Animated.View style={[styles.refreshIconWrap, { opacity: fadeAnim }]}>
                  {isRefreshing ? (
                    <ActivityIndicator size="small" color="#007AFF" style={styles.refreshSpinner} />
                  ) : (
                    <Ionicons name="refresh" size={12} color="#007AFF" />
                  )}
                  <Text style={styles.refreshLabel}>
                    {isRefreshing ? "Updating" : "Refresh"}
                  </Text>
                </Animated.View>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Stop sections */}
      {data.stops.map((stop, i) => {
        const localizedName = getStopName(stop);
        return (
        <View
          key={i}
          style={[styles.stopSection, i > 0 && [styles.stopSeparator, { borderTopColor: theme.separator }]]}
        >
          {/* Stop name */}
          <Pressable
            onPress={() =>
              onLocationClick?.({
                name: localizedName,
                lat: stop.lat,
                lng: stop.lng,
              })
            }
            style={({ pressed }) => [
              styles.stopNameRow,
              pressed && styles.stopNamePressed,
            ]}
          >
            <View style={styles.stopIcon}>
              <Ionicons name="location" size={12} color="#007AFF" />
            </View>
            <Text style={styles.stopName} numberOfLines={1}>
              {localizedName}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color={theme.chevronColor}
            />
          </Pressable>

          {/* Arrivals for this stop */}
          {stop.arrivals.map((arrival, j) => {
            const dest = getDestination(arrival);
            const showDest =
              dest &&
              !["N/A", "Inbound", "Outbound", "-"].includes(
                dest.trim(),
              );

            return (
              <View
                key={j}
                style={[styles.arrivalItem, j > 0 && styles.arrivalSeparator]}
              >
                {/* Route + destination row */}
                <View style={styles.routeRow}>
                  <Pressable
                    onPress={() => handleRouteBadgePress(stop, arrival)}
                    style={({ pressed }) => [
                      styles.routeBadge,
                      trackedKey === `${arrival.route}:${stop.id}` && styles.routeBadgeTracked,
                      pressed && styles.routeBadgePressed,
                    ]}
                  >
                    <Ionicons
                      name={trackedKey === `${arrival.route}:${stop.id}` ? "radio" : "bus"}
                      size={10}
                      color="#fff"
                    />
                    <Text style={styles.routeNumber}>{arrival.route}</Text>
                  </Pressable>
                  {showDest && (
                    <Text style={[styles.destination, { color: theme.textSecondary }]} numberOfLines={1}>
                      {dest}
                    </Text>
                  )}
                </View>

                {/* ETA pills */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.etaContainer}
                >
                  {arrival.etas.map((eta, k) => (
                    <EtaPill
                      key={k}
                      minutes={eta.minutes}
                      remarks={eta.remarks}
                    />
                  ))}
                </ScrollView>
              </View>
            );
          })}
        </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
  },
  stale: {
    opacity: 0.4,
  },

  /* ── Header ──────────────────────────── */
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.41,
  },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refreshTime: {
    fontSize: 12,
    letterSpacing: -0.08,
  },
  refreshButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,122,255,0.12)",
  },
  refreshButtonPressed: {
    backgroundColor: "rgba(0,122,255,0.24)",
  },
  refreshIconWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  refreshSpinner: {
    transform: [{ scale: 0.6 }],
    width: 12,
    height: 12,
  },
  refreshLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#007AFF",
    letterSpacing: -0.08,
  },

  /* ── Stop section ────────────────────── */
  stopSection: {
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  stopSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stopNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingVertical: 2,
  },
  stopNamePressed: {
    opacity: 0.6,
  },
  stopIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(0,122,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  stopName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#007AFF",
    letterSpacing: -0.16,
  },

  /* ── Arrival item ────────────────────── */
  arrivalItem: {
    paddingBottom: 10,
    gap: 8,
  },
  arrivalSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(84,84,88,0.2)",
    paddingTop: 10,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  routeBadgeTracked: {
    backgroundColor: "#34C759",
  },
  routeBadgePressed: {
    opacity: 0.7,
  },
  routeNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.08,
  },
  destination: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
    letterSpacing: -0.16,
  },

  /* ── ETA row ─────────────────────────── */
  etaContainer: {
    flexDirection: "row",
    gap: 6,
  },
});
