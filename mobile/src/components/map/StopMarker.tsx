import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { useLocalizedStopName } from "@/lib/i18n/i18n-provider";
import type { MapStop } from "@/lib/types";

function etaColor(minutes: number) {
  if (minutes <= 0) return { bg: "rgba(239,68,68,0.2)", text: "#f87171" };
  if (minutes <= 5) return { bg: "rgba(34,197,94,0.2)", text: "#4ade80" };
  if (minutes <= 15) return { bg: "rgba(245,158,11,0.2)", text: "#fbbf24" };
  return { bg: "rgba(113,113,122,0.2)", text: "#a1a1aa" };
}

function etaLabel(minutes: number): string {
  if (minutes <= 0) return "Dep";
  return `${minutes}m`;
}

export function StopMarker({
  stop,
  onPress,
}: {
  stop: MapStop;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const getStopName = useLocalizedStopName();
  const hasArrivals = stop.arrivals && stop.arrivals.length > 0;
  const nextEta = hasArrivals
    ? Math.min(
        ...stop.arrivals!.flatMap((a) => a.etas.map((e) => e.minutes))
      )
    : null;

  const colors = nextEta !== null ? etaColor(nextEta) : null;

  return (
    <Pressable onPress={onPress} style={styles.container}>
      <View style={styles.row}>
        <View style={styles.dot} />
        {nextEta !== null && colors && (
          <View style={[styles.etaBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.etaText, { color: colors.text }]}>
              {etaLabel(nextEta)}
            </Text>
          </View>
        )}
      </View>
      <View style={[styles.labelBg, { backgroundColor: theme.mapLabelBg }]}>
        <Text style={[styles.label, { color: theme.mapLabelText }]} numberOfLines={1}>
          {getStopName(stop)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#60a5fa",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  etaBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  etaText: {
    fontSize: 9,
    fontWeight: "700",
  },
  labelBg: {
    marginTop: 2,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 120,
  },
  label: {
    fontSize: 10,
    fontWeight: "500",
  },
});
