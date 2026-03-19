import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EtaPill } from "./EtaPill";
import { useTheme } from "@/hooks/use-theme";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

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
}: {
  data: DisplayArrivalsInput;
  onLocationClick?: (pin: LocationPin) => void;
  stale?: boolean;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground }, stale && styles.stale]}>
      {/* Header: title + refresh */}
      {(data.title || onRefresh) && (
        <View style={[styles.header, { borderBottomColor: theme.separator }]}>
          <View style={styles.headerTop}>
            {data.title ? (
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                {data.title}
              </Text>
            ) : null}
          </View>
          {onRefresh && (
            <View style={styles.refreshRow}>
              {lastRefreshedAt ? (
                <Text style={[styles.refreshTime, { color: theme.chevronColor }]}>
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
                {isRefreshing ? (
                  <ActivityIndicator size={12} color="#007AFF" />
                ) : (
                  <Ionicons name="refresh" size={12} color="#007AFF" />
                )}
                <Text style={styles.refreshLabel}>
                  {isRefreshing ? "Updating" : "Refresh"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Stop sections */}
      {data.stops.map((stop, i) => (
        <View
          key={i}
          style={[styles.stopSection, i > 0 && [styles.stopSeparator, { borderTopColor: theme.separator }]]}
        >
          {/* Stop name */}
          <Pressable
            onPress={() =>
              onLocationClick?.({
                name: stop.name,
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
              {stop.name}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color={theme.chevronColor}
            />
          </Pressable>

          {/* Arrivals for this stop */}
          {stop.arrivals.map((arrival, j) => {
            const showDest =
              arrival.destination &&
              !["N/A", "Inbound", "Outbound", "-"].includes(
                arrival.destination.trim(),
              );

            return (
              <View
                key={j}
                style={[styles.arrivalItem, j > 0 && styles.arrivalSeparator]}
              >
                {/* Route + destination row */}
                <View style={styles.routeRow}>
                  <View style={styles.routeBadge}>
                    <Ionicons name="bus" size={10} color="#fff" />
                    <Text style={styles.routeNumber}>{arrival.route}</Text>
                  </View>
                  {showDest && (
                    <Text style={[styles.destination, { color: theme.textSecondary }]} numberOfLines={1}>
                      {arrival.destination}
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
      ))}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,122,255,0.12)",
  },
  refreshButtonPressed: {
    backgroundColor: "rgba(0,122,255,0.24)",
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
