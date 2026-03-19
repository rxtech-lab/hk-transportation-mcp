import { View, Text, StyleSheet } from "react-native";

function etaColor(minutes: number) {
  if (minutes <= 0) return { bg: "rgba(239,68,68,0.15)", text: "#f87171" };
  if (minutes <= 5) return { bg: "rgba(34,197,94,0.15)", text: "#4ade80" };
  if (minutes <= 15) return { bg: "rgba(245,158,11,0.15)", text: "#fbbf24" };
  return { bg: "rgba(113,113,122,0.15)", text: "#a1a1aa" };
}

function etaLabel(minutes: number): string {
  if (minutes <= 0) return "Departed";
  return `${minutes} min`;
}

export function EtaPill({
  minutes,
  remarks,
}: {
  minutes: number;
  remarks?: string;
}) {
  const colors = etaColor(minutes);
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        {etaLabel(minutes)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
});
