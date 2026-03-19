import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { LocationPin } from "@/lib/types";

export function LocationButton({
  name,
  lat,
  lng,
  onPress,
}: {
  name: string;
  lat: number;
  lng: number;
  onPress?: (pin: LocationPin) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress?.({ name, lat, lng })}
      style={styles.button}
    >
      <Ionicons name="location" size={12} color="#60a5fa" />
      <Text style={styles.text}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  text: {
    fontSize: 13,
    color: "#60a5fa",
    textDecorationLine: "underline",
    textDecorationColor: "rgba(96,165,250,0.4)",
  },
});
