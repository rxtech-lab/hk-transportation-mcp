import { View, Text, StyleSheet } from "react-native";

export function MessageBubble({ text }: { text: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.bubble}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  bubble: {
    maxWidth: "85%",
    backgroundColor: "#3b82f6",
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
  },
});
