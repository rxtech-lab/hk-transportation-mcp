import { View, Text, StyleSheet } from "react-native";
import { useThemeMode } from "@/hooks/use-theme";

function etaColor(minutes: number, isDark: boolean) {
  if (minutes <= 0) return { bg: isDark ? "rgba(255,69,58,0.16)" : "rgba(255,69,58,0.12)", text: "#FF453A" };
  if (minutes <= 3) return { bg: isDark ? "rgba(48,209,88,0.16)" : "rgba(48,209,88,0.14)", text: "#30D158" };
  if (minutes <= 10) return { bg: isDark ? "rgba(255,214,10,0.16)" : "rgba(255,179,0,0.18)", text: isDark ? "#FFD60A" : "#B8860B" };
  return { bg: isDark ? "rgba(142,142,147,0.16)" : "rgba(142,142,147,0.12)", text: isDark ? "rgba(235,235,245,0.6)" : "rgba(60,60,67,0.6)" };
}

export function EtaPill({
  minutes,
  remarks,
}: {
  minutes: number;
  remarks?: string;
}) {
  const isDark = useThemeMode() === "dark";
  const colors = etaColor(minutes, isDark);

  if (minutes <= 0) {
    return (
      <View style={[styles.pill, { backgroundColor: colors.bg }]}>
        <Text style={[styles.departedText, { color: colors.text }]}>Left</Text>
      </View>
    );
  }

  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <Text style={[styles.minutes, { color: colors.text }]}>{minutes}</Text>
      <Text style={[styles.unit, { color: colors.text }]}>min</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "baseline",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  minutes: {
    fontSize: 17,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.41,
  },
  unit: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: -0.08,
    opacity: 0.8,
  },
  departedText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: -0.08,
  },
});
