import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EtaPill } from "./EtaPill";
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
  return (
    <View style={[styles.card, stale && styles.stale]}>
      {(data.title || onRefresh) && (
        <View style={styles.header}>
          {data.title ? (
            <Text style={styles.title}>{data.title}</Text>
          ) : null}
          {onRefresh && (
            <View style={styles.refreshRow}>
              {lastRefreshedAt ? (
                <Text style={styles.refreshTime}>
                  {formatTime(lastRefreshedAt)}
                </Text>
              ) : null}
              <Pressable
                onPress={onRefresh}
                disabled={isRefreshing}
                style={styles.refreshButton}
              >
                {isRefreshing ? (
                  <ActivityIndicator size={13} color="#a1a1aa" />
                ) : (
                  <Ionicons name="refresh" size={13} color="#a1a1aa" />
                )}
              </Pressable>
            </View>
          )}
        </View>
      )}

      {data.stops.map((stop, i) => (
        <View
          key={i}
          style={[styles.stopRow, i > 0 && styles.stopBorder]}
        >
          <Pressable
            onPress={() =>
              onLocationClick?.({
                name: stop.name,
                lat: stop.lat,
                lng: stop.lng,
              })
            }
            style={styles.stopNameRow}
          >
            <Ionicons name="location" size={13} color="#60a5fa" />
            <Text style={styles.stopName}>{stop.name}</Text>
          </Pressable>

          {stop.arrivals.map((arrival, j) => (
            <View key={j} style={styles.arrivalRow}>
              <View style={styles.routeBadge}>
                <Ionicons name="bus" size={11} color="#a1a1aa" />
                <Text style={styles.routeText}>{arrival.route}</Text>
              </View>
              {arrival.destination &&
                !["N/A", "Inbound", "Outbound", "-"].includes(
                  arrival.destination.trim()
                ) && (
                  <Text style={styles.destination} numberOfLines={1}>
                    → {arrival.destination}
                  </Text>
                )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.etaScroll}
                contentContainerStyle={styles.etaRow}
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
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    overflow: "hidden",
  },
  stale: {
    opacity: 0.45,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  refreshTime: {
    fontSize: 11,
    color: "#71717a",
  },
  refreshButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stopRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  stopBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  stopNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stopName: {
    fontSize: 13,
    color: "#60a5fa",
    textDecorationLine: "underline",
    textDecorationColor: "rgba(96,165,250,0.4)",
  },
  arrivalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  routeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  destination: {
    fontSize: 12,
    color: "#71717a",
    flexShrink: 1,
  },
  etaScroll: {
    flexShrink: 1,
    marginLeft: "auto",
  },
  etaRow: {
    flexDirection: "row",
    gap: 4,
  },
});
