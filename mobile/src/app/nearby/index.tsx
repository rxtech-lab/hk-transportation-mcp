import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  SectionList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import {
  useDictionary,
  useLocalizedStopName,
  useLocalizedDestination,
} from "@/lib/i18n/i18n-provider";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNearbyArrivals } from "@/hooks/useNearbyArrivals";
import { EtaPill } from "@/components/arrivals/EtaPill";
import * as Haptics from "expo-haptics";
import type { ArrivalData, StopData } from "@/lib/types";
import { getRouteTrackingCounts } from "@/lib/db";

interface Section {
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLng: number;
  data: ArrivalData[];
}

function buildSections(
  stops: StopData[],
  getStopName: (stop: StopData) => string,
  trackingCounts: Map<string, number>,
): Section[] {
  const sections = stops
    .filter((s) => s.arrivals.length > 0)
    .map((stop) => {
      // Sort arrivals: tracked routes first (by count DESC), then original order
      const sorted = [...stop.arrivals].sort((a, b) => {
        const countA = trackingCounts.get(`${a.route}|${a.destination}`) ?? 0;
        const countB = trackingCounts.get(`${b.route}|${b.destination}`) ?? 0;
        return countB - countA;
      });
      return {
        stopId: stop.id,
        stopName: getStopName(stop),
        stopLat: stop.lat,
        stopLng: stop.lng,
        data: sorted,
      };
    });

  // Sort stops: those with tracked routes first, by highest tracking count
  sections.sort((a, b) => {
    const maxA = Math.max(
      0,
      ...a.data.map(
        (d) => trackingCounts.get(`${d.route}|${d.destination}`) ?? 0,
      ),
    );
    const maxB = Math.max(
      0,
      ...b.data.map(
        (d) => trackingCounts.get(`${d.route}|${d.destination}`) ?? 0,
      ),
    );
    return maxB - maxA;
  });

  return sections;
}

export default function NearbyScreen() {
  const theme = useTheme();
  const dict = useDictionary();
  const getStopName = useLocalizedStopName();
  const getDestination = useLocalizedDestination();
  const insets = useSafeAreaInsets();
  const geo = useGeolocation();
  const router = useRouter();
  const [locationRequested, setLocationRequested] = useState(false);

  const { stops, isLoading, isRefreshing, lastRefreshedAt, refetch } =
    useNearbyArrivals(geo.latitude, geo.longitude);

  const [trackingCounts, setTrackingCounts] = useState<Map<string, number>>(
    () => new Map(),
  );

  useFocusEffect(
    useCallback(() => {
      setTrackingCounts(getRouteTrackingCounts());
    }, []),
  );

  // Haptic feedback when nearby arrivals data refreshes
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!lastRefreshedAt) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [lastRefreshedAt]);

  const sections = buildSections(stops, getStopName, trackingCounts);

  useFocusEffect(
    useCallback(() => {
      geo.request().then(() => setLocationRequested(true));
    }, []), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const renderItem = useCallback(
    ({ item, section }: { item: ArrivalData; section: Section }) => {
      const dest = getDestination(item);
      const showDest =
        dest && !["N/A", "Inbound", "Outbound", "-"].includes(dest.trim());
      const isTracked =
        (trackingCounts.get(`${item.route}|${item.destination}`) ?? 0) > 0;

      return (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/nearby/route",
              params: {
                route: item.route,
                stopId: section.stopId,
                destination: dest,
              },
            })
          }
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: theme.cardBackground },
            pressed && styles.rowPressed,
          ]}
        >
          <View style={styles.routeCol}>
            <View
              style={[styles.routeBadge, isTracked && styles.routeBadgeTracked]}
            >
              <Ionicons name="bus" size={10} color="#fff" />
              <Text style={styles.routeNumber}>{item.route}</Text>
            </View>
            {showDest && (
              <Text
                style={[styles.destination, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {dest}
              </Text>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.etaRow}
          >
            {item.etas.map((eta, k) => (
              <EtaPill key={k} minutes={eta.minutes} remarks={eta.remarks} />
            ))}
          </ScrollView>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={theme.textSecondary}
          />
        </Pressable>
      );
    },
    [theme, router, getDestination, trackingCounts],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: Section }) => (
      <Pressable
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.sectionHeaderPressed,
        ]}
        onPress={() =>
          router.push({
            pathname: "/nearby/map",
            params: {
              name: section.stopName,
              lat: String(section.stopLat),
              lng: String(section.stopLng),
            },
          })
        }
      >
        <View style={styles.stopIcon}>
          <Ionicons name="location" size={12} color="#007AFF" />
        </View>
        <Text
          style={[styles.stopName, { color: theme.text }]}
          numberOfLines={1}
        >
          {section.stopName}
        </Text>
        <Ionicons name="map-outline" size={16} color={theme.textSecondary} />
      </Pressable>
    ),
    [theme, router],
  );

  // Loading state
  if (geo.loading || (!locationRequested && !geo.latitude)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          {dict.nearby.loading}
        </Text>
      </View>
    );
  }

  // Permission denied state
  if (geo.permissionDenied) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 44 }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="location-outline" size={32} color="#8E8E93" />
        </View>
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          {dict.nearby.locationDenied}
        </Text>
        <Pressable
          onPress={geo.openSettings}
          style={({ pressed }) => [
            styles.settingsButton,
            pressed && styles.settingsButtonPressed,
          ]}
        >
          <Text style={styles.settingsButtonText}>
            {dict.nearby.locationSettings}
          </Text>
        </Pressable>
      </View>
    );
  }

  // Data loaded state
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) => `${item.route}-${index}`}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={[
        styles.list,
        { paddingTop: insets.top + 52 },
        sections.length === 0 && styles.emptyList,
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refetch}
          tintColor="#007AFF"
          progressViewOffset={insets.top + 52}
        />
      }
      ListHeaderComponent={null}
      ListEmptyComponent={
        isLoading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="bus-outline" size={48} color="#8E8E93" />
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              {dict.nearby.empty}
            </Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  emptyList: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderPressed: {
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
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 6,
    gap: 12,
  },
  rowPressed: {
    opacity: 0.7,
  },
  routeCol: {
    flexShrink: 1,
    gap: 2,
  },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  routeBadgeTracked: {
    backgroundColor: "#34C759",
  },
  routeNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.08,
  },
  destination: {
    fontSize: 13,
    fontWeight: "400",
    letterSpacing: -0.08,
  },
  etaRow: {
    flexDirection: "row",
    gap: 6,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(142,142,147,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#007AFF",
  },
  settingsButtonPressed: {
    opacity: 0.7,
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  emptyContainer: {
    alignItems: "center",
    gap: 12,
  },
});
