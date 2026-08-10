import { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { EtaPill } from "./EtaPill";
import { useTheme } from "@/hooks/use-theme";
import {
  useLocalizedStopName,
  useLocalizedDestination,
} from "@/lib/i18n/i18n-provider";
import type {
  DisplayArrivalsInput,
  LocationPin,
  StopData,
  ArrivalData,
} from "@/lib/types";
import { getTrackedInfo } from "@/lib/live-activity";

const DEFAULT_VISIBLE_ROWS = 5;

function operatorBadgeColor(operator?: string): string {
  switch (operator) {
    case "GMB":
      return "#34C759";
    case "KMB":
      return "#CC0000";
    default:
      return "#007AFF";
  }
}

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
  const router = useRouter();
  const segments = useSegments();
  const getStopName = useLocalizedStopName();
  const getDestination = useLocalizedDestination();
  const trackedKey = (() => {
    const info = getTrackedInfo();
    return info ? `${info.route}:${info.stopId}` : null;
  })();

  const handleRouteBadgePress = useCallback(
    (stop: StopData, arrival: ArrivalData) => {
      const dest = getDestination(arrival);
      const routePrefix =
        segments[0] === "history" ? "/history" : "/(transport)";
      router.push({
        pathname: `${routePrefix}/route` as any,
        params: {
          route: arrival.route,
          stopId: stop.id,
          destination: dest,
          operator: arrival.operator ?? "",
        },
      });
    },
    [router, segments, getDestination],
  );

  // Filter out stops with no arrivals
  const stopsWithArrivals =
    data.stops?.filter((s) => s.arrivals?.length > 0) ?? [];

  // Count total arrival rows for expand/collapse
  const totalRows = stopsWithArrivals.reduce(
    (sum, s) => sum + s.arrivals.length,
    0,
  );
  const canExpand = totalRows > DEFAULT_VISIBLE_ROWS;

  const isPendingFetch = !!(data.query || data.url);

  if (!stopsWithArrivals.length && !isPendingFetch) return null;

  // Query-based flow: show loading state while stops are being fetched
  if (!stopsWithArrivals.length) {
    return (
      <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
        <View style={[styles.header, { borderBottomColor: theme.separator }]}>
          {data.title ? (
            <Text
              style={[styles.title, { color: theme.text }]}
              numberOfLines={2}
            >
              {data.title}
            </Text>
          ) : null}
          <View style={styles.refreshRow}>
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground },
        stale && styles.stale,
      ]}
    >
      {/* Header: title + refresh */}
      {(data.title || onRefresh) && (
        <View style={[styles.header, { borderBottomColor: theme.separator }]}>
          <Pressable
            style={styles.headerTop}
            onPress={onHeaderPress}
            disabled={!onHeaderPress}
          >
            {data.title ? (
              <Text
                style={[styles.title, { color: theme.text }]}
                numberOfLines={2}
              >
                {data.title}
              </Text>
            ) : null}
            {onHeaderPress && (
              <Ionicons
                name="expand-outline"
                size={16}
                color={theme.chevronColor}
              />
            )}
          </Pressable>
          {onRefresh && (
            <View style={styles.refreshRow}>
              {lastRefreshedAt ? (
                <Text
                  style={[
                    styles.refreshTime,
                    { color: theme.chevronColor },
                  ]}
                >
                  Updated {formatTime(lastRefreshedAt)}
                </Text>
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
                <View style={styles.refreshIconWrap}>
                  {isRefreshing ? (
                    <ActivityIndicator
                      size="small"
                      color="#007AFF"
                      style={styles.refreshSpinner}
                    />
                  ) : (
                    <Ionicons name="refresh" size={12} color="#007AFF" />
                  )}
                  <Text style={styles.refreshLabel}>
                    {isRefreshing ? "Updating" : "Refresh"}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Stop sections */}
      {(() => {
        let rowsRendered = 0;
        const limit = onHeaderPress ? DEFAULT_VISIBLE_ROWS : Infinity;
        return stopsWithArrivals.map((stop, i) => {
          if (rowsRendered >= limit) return null;
          const remainingRows = limit - rowsRendered;
          const visibleArrivals = stop.arrivals.slice(0, remainingRows);
          rowsRendered += visibleArrivals.length;
          const localizedName = getStopName(stop);
          return (
            <View
              key={i}
              style={[
                styles.stopSection,
                i > 0 && [
                  styles.stopSeparator,
                  { borderTopColor: theme.separator },
                ],
              ]}
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
              {visibleArrivals.map((arrival, j) => {
                const dest = getDestination(arrival);
                const showDest =
                  dest &&
                  !["N/A", "Inbound", "Outbound", "-"].includes(dest.trim());

                return (
                  <View
                    key={j}
                    style={[
                      styles.arrivalItem,
                      j > 0 && styles.arrivalSeparator,
                    ]}
                  >
                    {/* Route + destination row */}
                    <View style={styles.routeRow}>
                      <Pressable
                        onPress={() => handleRouteBadgePress(stop, arrival)}
                        style={({ pressed }) => [
                          styles.routeBadge,
                          {
                            backgroundColor: operatorBadgeColor(
                              arrival.operator,
                            ),
                          },
                          trackedKey === `${arrival.route}:${stop.id}` &&
                            styles.routeBadgeTracked,
                          pressed && styles.routeBadgePressed,
                        ]}
                      >
                        <Ionicons
                          name={
                            trackedKey === `${arrival.route}:${stop.id}`
                              ? "radio"
                              : "bus"
                          }
                          size={10}
                          color="#fff"
                        />
                        <Text style={styles.routeNumber}>
                          {arrival.route}
                        </Text>
                      </Pressable>
                      {showDest && (
                        <Text
                          style={[
                            styles.destination,
                            { color: theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
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
        });
      })()}

      {/* Fade overlay + tap to open sheet */}
      {canExpand && onHeaderPress && (
        <Pressable onPress={onHeaderPress} style={styles.fadeOverlay}>
          {/* Simulated gradient with stacked opacity layers */}
          <View
            style={[
              styles.fadeBand,
              styles.fadeBandTop,
              { backgroundColor: theme.cardBackground },
            ]}
          />
          <View
            style={[
              styles.fadeBand,
              styles.fadeBandMiddle,
              { backgroundColor: theme.cardBackground },
            ]}
          />
          <View
            style={[
              styles.fadeBand,
              styles.fadeBandBottom,
              { backgroundColor: theme.cardBackground },
            ]}
          />
          <View style={styles.showMoreRow}>
            <Ionicons name="chevron-down" size={14} color={theme.chevronColor} />
            <Text style={[styles.expandLabel, { color: theme.chevronColor }]}>
              Show all {totalRows} routes
            </Text>
          </View>
        </Pressable>
      )}
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

  /* ── Fade overlay + show more ────────── */
  fadeOverlay: {
    height: 72,
    marginTop: -48,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 12,
  },
  fadeBand: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  fadeBandTop: {
    top: 0,
    height: "33%",
    opacity: 0.3,
  },
  fadeBandMiddle: {
    top: "33%",
    height: "33%",
    opacity: 0.7,
  },
  fadeBandBottom: {
    top: "66%",
    height: "34%",
    opacity: 1,
  },
  showMoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 1,
  },
  expandLabel: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: -0.08,
  },
});
