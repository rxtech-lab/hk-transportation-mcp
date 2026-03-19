import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, FlatList } from "react-native";
import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Ionicons } from "@expo/vector-icons";
import { EtaPill } from "@/components/arrivals/EtaPill";
import type { MapStop } from "@/lib/types";

interface StopListSheetProps {
  stops: MapStop[];
  onStopPress?: (stop: MapStop) => void;
}

function StopRow({
  stop,
  onPress,
}: {
  stop: MapStop;
  onPress?: () => void;
}) {
  const hasArrivals = stop.arrivals && stop.arrivals.length > 0;

  return (
    <Pressable onPress={onPress} style={styles.stopRow}>
      <View style={styles.stopHeader}>
        <Ionicons name="location" size={16} color="#60a5fa" />
        <Text style={styles.stopName} numberOfLines={1}>
          {stop.name}
        </Text>
      </View>

      {hasArrivals ? (
        stop.arrivals!.map((arrival, i) => (
          <View key={i} style={styles.arrivalRow}>
            <View style={styles.routeBadge}>
              <Ionicons name="bus" size={11} color="#a1a1aa" />
              <Text style={styles.routeText}>{arrival.route}</Text>
            </View>
            {arrival.destination &&
              !["N/A", "Inbound", "Outbound", "-"].includes(
                arrival.destination
              ) && (
                <Text style={styles.destination} numberOfLines={1}>
                  → {arrival.destination}
                </Text>
              )}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.etaList}
              style={styles.etaScroll}
            >
              {arrival.etas.map((eta, j) => (
                <EtaPill key={j} minutes={eta.minutes} remarks={eta.remarks} />
              ))}
            </ScrollView>
          </View>
        ))
      ) : (
        <Text style={styles.noArrivals}>No arrival data</Text>
      )}
    </Pressable>
  );
}

export function StopListSheet({ stops, onStopPress }: StopListSheetProps) {
  const sheetRef = useRef<TrueSheet>(null);

  useEffect(() => {
    if (stops.length > 0) {
      sheetRef.current?.present();
    }
  }, [stops.length]);

  if (stops.length === 0) return null;

  return (
    <TrueSheet
      ref={sheetRef}
      detents={["auto", 0.5, 1]}
      cornerRadius={16}
      backgroundColor="#18181b"
      grabber
      scrollable
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {stops.length} {stops.length === 1 ? "Stop" : "Stops"}
        </Text>
      </View>
      <FlatList
        nestedScrollEnabled
        data={stops}
        keyExtractor={(item: MapStop, i: number) => `${item.lat}-${item.lng}-${i}`}
        renderItem={({ item }) => (
          <StopRow stop={item} onPress={() => onStopPress?.(item)} />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </TrueSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 6,
  },
  stopRow: {
    paddingVertical: 8,
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  stopName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
    flex: 1,
  },
  arrivalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginLeft: 22,
  },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  routeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  destination: {
    fontSize: 11,
    color: "#a1a1aa",
    flexShrink: 1,
  },
  etaScroll: {
    flexShrink: 0,
  },
  etaList: {
    flexDirection: "row",
    gap: 4,
  },
  noArrivals: {
    fontSize: 12,
    color: "#52525b",
    marginLeft: 22,
    marginTop: 2,
  },
});
