import { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { EtaPill } from "@/components/arrivals/EtaPill";
import { useTheme } from "@/hooks/use-theme";
import { useLocalizedStopName } from "@/lib/i18n/i18n-provider";
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
  const theme = useTheme();
  const getStopName = useLocalizedStopName();

  return (
    <Pressable onPress={onPress} style={styles.stopRow}>
      <View style={styles.stopHeader}>
        <Ionicons name="location" size={16} color="#60a5fa" />
        <Text style={[styles.stopName, { color: theme.text }]} numberOfLines={1}>
          {getStopName(stop)}
        </Text>
      </View>

      {hasArrivals ? (
        stop.arrivals!.map((arrival, i) => (
          <View key={i} style={styles.arrivalRow}>
            <View style={[styles.routeBadge, { backgroundColor: theme.routeBadgeBg }]}>
              <Ionicons name="bus" size={11} color={theme.textTertiary} />
              <Text style={[styles.routeText, { color: theme.routeBadgeText }]}>{arrival.route}</Text>
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
  const snapPoints = useMemo(() => ["25%", "50%", "90%"], []);
  const theme = useTheme();

  const renderItem = useCallback(
    ({ item }: { item: MapStop }) => (
      <StopRow stop={item} onPress={() => onStopPress?.(item)} />
    ),
    [onStopPress]
  );

  if (stops.length === 0) return null;

  return (
    <BottomSheet
      snapPoints={snapPoints}
      index={0}
      enablePanDownToClose={false}
      backgroundStyle={[styles.sheetBackground, { backgroundColor: theme.sheetBackground }]}
      handleIndicatorStyle={[styles.handleIndicator, { backgroundColor: theme.sheetHandle }]}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {stops.length} {stops.length === 1 ? "Stop" : "Stops"}
        </Text>
      </View>
      <BottomSheetFlatList
        data={stops}
        keyExtractor={(item: MapStop, i: number) => `${item.lat}-${item.lng}-${i}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: theme.separatorLight }]} />}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleIndicator: {
    width: 36,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  separator: {
    height: 1,
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
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  routeText: {
    fontSize: 11,
    fontWeight: "600",
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
