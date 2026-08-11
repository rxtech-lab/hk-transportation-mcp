import { useCallback, useMemo, useState } from "react";
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
import { useTheme } from "@/hooks/use-theme";
import {
  useI18n,
  useLocalizedStopName,
  useLocalizedDestination,
} from "@/lib/i18n/i18n-provider";
import type {
  DisplayRouteInput,
  LocationPin,
  RouteInfoData,
  RouteVariant,
} from "@/lib/types";

/** Stops shown inline before the card collapses into "show all". */
const DEFAULT_VISIBLE_STOPS = 5;

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

export function RouteCard({
  input,
  data,
  onLocationClick,
  stale,
}: {
  input: DisplayRouteInput;
  data?: RouteInfoData | null;
  onLocationClick?: (pin: LocationPin) => void;
  stale?: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { dict } = useI18n();
  const getStopName = useLocalizedStopName();
  const getDestination = useLocalizedDestination();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const variants = data?.routes ?? [];
  const variant: RouteVariant | undefined =
    variants[Math.min(selectedIdx, variants.length - 1)];

  const destinationLabel = useCallback(
    (v: RouteVariant) =>
      getDestination({
        destination: v.destination,
        dest_tc: v.destination_tc,
        dest_sc: v.destination_sc,
      }) || v.destination,
    [getDestination],
  );

  const visibleStops = useMemo(() => {
    if (!variant) return [];
    return expanded
      ? variant.stops
      : variant.stops.slice(0, DEFAULT_VISIBLE_STOPS);
  }, [variant, expanded]);

  const handleOpenDetail = useCallback(() => {
    if (!variant || variant.stops.length === 0) return;
    const routePrefix = segments[0] === "history" ? "/history" : "/(transport)";
    router.push({
      pathname: `${routePrefix}/route` as any,
      params: {
        route: variant.route,
        // The detail screen anchors on a stop; the origin is always on-route.
        stopId: variant.stops[0].id,
        destination: destinationLabel(variant),
        operator: variant.operator,
      },
    });
  }, [variant, router, segments, destinationLabel]);

  // Still fetching — the card is rendered from the tool input alone.
  if (!data) {
    return (
      <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.loadingRow}>
          <View
            style={[
              styles.routeBadge,
              { backgroundColor: operatorBadgeColor(input.operator) },
            ]}
          >
            <Ionicons name="bus" size={11} color="#fff" />
            <Text style={styles.routeNumber}>{input.route}</Text>
          </View>
          <ActivityIndicator size="small" color="#007AFF" />
        </View>
      </View>
    );
  }

  if (!variant) {
    return (
      <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.loadingRow}>
          <Ionicons
            name={data.error ? "cloud-offline-outline" : "bus-outline"}
            size={16}
            color={theme.textSecondary}
          />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {data.error
              ? dict.route.loadFailed.replace("{0}", input.route)
              : dict.route.notFound.replace("{0}", input.route)}
          </Text>
        </View>
      </View>
    );
  }

  const hiddenCount = variant.stops.length - visibleStops.length;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.cardBackground },
        stale && styles.stale,
      ]}
    >
      {/* Header: route badge + origin → destination */}
      <Pressable
        onPress={handleOpenDetail}
        style={({ pressed }) => [
          styles.header,
          { borderBottomColor: theme.separator },
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.routeBadge,
            { backgroundColor: operatorBadgeColor(variant.operator) },
          ]}
        >
          <Ionicons name="bus" size={11} color="#fff" />
          <Text style={styles.routeNumber}>{variant.route}</Text>
        </View>
        <View style={styles.headerText}>
          <Text
            style={[styles.headerTitle, { color: theme.text }]}
            numberOfLines={1}
          >
            {destinationLabel(variant)}
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {dict.route.stopCount.replace(
              "{0}",
              String(variant.stop_count),
            )}
            {variant.operator ? ` · ${variant.operator}` : ""}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.chevronColor}
        />
      </Pressable>

      {/* Direction switcher — only when the number runs more than one way */}
      {variants.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.directionRow}
        >
          {variants.map((v, i) => {
            const active = i === selectedIdx;
            return (
              <Pressable
                key={v.route_id}
                onPress={() => {
                  setSelectedIdx(i);
                  setExpanded(false);
                }}
                style={[
                  styles.directionPill,
                  { borderColor: theme.separator },
                  active && styles.directionPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.directionText,
                    { color: theme.textSecondary },
                    active && styles.directionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  → {destinationLabel(v)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Stop timeline */}
      <View style={styles.stopList}>
        {visibleStops.map((stop, i) => {
          const isFirst = i === 0;
          const isLast = i === visibleStops.length - 1 && hiddenCount === 0;
          const name = getStopName(stop);
          return (
            <Pressable
              key={`${stop.id}-${stop.seq}`}
              onPress={() => onLocationClick?.({ name, lat: stop.lat, lng: stop.lng })}
              style={({ pressed }) => [
                styles.stopRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.timeline}>
                <View
                  style={[
                    styles.line,
                    isFirst && styles.lineHidden,
                  ]}
                />
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: theme.cardBackground },
                    (isFirst || isLast) && styles.dotTerminal,
                  ]}
                />
                <View
                  style={[
                    styles.line,
                    isLast && styles.lineHidden,
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.stopName,
                  { color: theme.text },
                  (isFirst || isLast) && styles.stopNameTerminal,
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Expand / collapse */}
      {variant.stops.length > DEFAULT_VISIBLE_STOPS && (
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          style={({ pressed }) => [
            styles.expandRow,
            { borderTopColor: theme.separator },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color="#007AFF"
          />
          <Text style={styles.expandLabel}>
            {expanded
              ? dict.route.showLess
              : dict.route.showAllStops.replace(
                  "{0}",
                  String(variant.stops.length),
                )}
          </Text>
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
  pressed: {
    opacity: 0.6,
  },

  /* ── Loading / empty ─────────────────── */
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyText: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.16,
  },

  /* ── Header ──────────────────────────── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    letterSpacing: -0.08,
  },
  routeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  routeNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.08,
  },

  /* ── Direction switcher ──────────────── */
  directionRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  directionPill: {
    maxWidth: 220,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  directionPillActive: {
    backgroundColor: "rgba(0,122,255,0.12)",
    borderColor: "rgba(0,122,255,0.35)",
  },
  directionText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: -0.08,
  },
  directionTextActive: {
    color: "#007AFF",
    fontWeight: "600",
  },

  /* ── Stop timeline ───────────────────── */
  stopList: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  timeline: {
    width: 14,
    alignSelf: "stretch",
    alignItems: "center",
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: "#007AFF",
  },
  lineHidden: {
    backgroundColor: "transparent",
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  dotTerminal: {
    backgroundColor: "#007AFF",
  },
  stopName: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 7,
    letterSpacing: -0.16,
  },
  stopNameTerminal: {
    fontWeight: "600",
  },

  /* ── Expand ──────────────────────────── */
  expandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  expandLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#007AFF",
    letterSpacing: -0.08,
  },
});
