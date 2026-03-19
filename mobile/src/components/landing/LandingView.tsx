import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function LandingHeader() {
  const { dict } = useI18n();

  return (
    <View style={styles.header}>
      <View style={styles.iconBox}>
        <Ionicons name="bus" size={32} color="#fff" />
      </View>
      <Text style={styles.title}>{dict.landing.title}</Text>
      <Text style={styles.subtitle}>{dict.landing.subtitle}</Text>
    </View>
  );
}

export function SuggestionChips({
  onSuggestion,
}: {
  onSuggestion: (text: string) => void;
}) {
  const { dict } = useI18n();

  return (
    <View style={styles.chips}>
      {dict.landing.suggestions.map((suggestion) => (
        <Pressable
          key={suggestion}
          onPress={() => onSuggestion(suggestion)}
          style={styles.chip}
        >
          <Text style={styles.chipText}>{suggestion}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
    backgroundColor: "#3b82f6",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#71717a",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  chipText: {
    fontSize: 13,
    color: "#a1a1aa",
  },
});
