import { useCallback, useState } from "react";
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
}: {
  stop: RouteStopInfo;
  route: string;
  isFirst: boolean;
  isLast: boolean;
  isCurrent: boolean;
  theme: ReturnType<typeof useTheme>;
  displayName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { stopData, isLoading } = useStopEta(stop.id, route, expanded);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const arrival = stopData?.arrivals?.find((a) => a.route === route);

  return (
    <Pressable
      onPress={toggle}
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
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
  }>();

  const router = useRouter();
  const { stops, destination, isLoading } = useRouteStops(
    params.route ?? null,
    params.stopId ?? null,
  );

  // Use localized destination from last stop if available
  const localizedDestination = stops.length > 0
    ? getStopName(stops[stops.length - 1])
    : destination;

  const title = params.route
    ? localizedDestination
      ? `${params.route} → ${localizedDestination}`
      : params.route
    : "";

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            title,
            headerRight: () => (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            ),
          }}
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 32 },
        ]}
      >
        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
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
                key={item.id}
                stop={item}
                route={params.route ?? ""}
                isFirst={index === 0}
                isLast={index === stops.length - 1}
                isCurrent={item.id === params.stopId}
                theme={theme}
                displayName={getStopName(item)}
              />
            ))
          )}
        </View>
      </ScrollView>
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
});
