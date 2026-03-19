import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function ToolCallBadge({
  toolName,
  state,
}: {
  toolName: string;
  state: string;
}) {
  const isDone = state === "output-available";
  const isError = state === "output-error";

  const bgColor = isDone
    ? "rgba(34,197,94,0.1)"
    : isError
      ? "rgba(239,68,68,0.1)"
      : "rgba(255,255,255,0.04)";
  const textColor = isDone
    ? "#4ade80"
    : isError
      ? "#f87171"
      : "#71717a";

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Ionicons name="construct" size={12} color={textColor} />
      <Text style={[styles.text, { color: textColor }]}>{toolName}</Text>
      {!isDone && !isError && (
        <Text style={[styles.dots, { color: textColor }]}>...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  dots: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 2,
  },
});
