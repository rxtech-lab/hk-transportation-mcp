import { View, Text, StyleSheet } from "react-native";

function etaColor(minutes: number) {
  if (minutes <= 0) return { bg: "rgba(255,69,58,0.16)", text: "#FF453A" };
  if (minutes <= 3) return { bg: "rgba(48,209,88,0.16)", text: "#30D158" };
  if (minutes <= 10) return { bg: "rgba(255,214,10,0.16)", text: "#FFD60A" };
  return { bg: "rgba(142,142,147,0.16)", text: "rgba(235,235,245,0.6)" };
}

export function EtaPill({
  minutes,
  remarks,
}: {
  minutes: number;
  remarks?: string;
}) {
  const colors = etaColor(minutes);

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
