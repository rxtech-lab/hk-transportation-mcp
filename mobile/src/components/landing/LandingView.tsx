import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/lib/i18n/i18n-provider";

const SUGGESTION_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
  0: "location",
  1: "navigate",
  2: "time",
};

function useGreeting() {
  const { dict } = useI18n();
  const hour = new Date().getHours();
  if (hour < 12) return dict.landing.greetingMorning;
  if (hour < 18) return dict.landing.greetingAfternoon;
  return dict.landing.greetingEvening;
}

export function LandingHeader() {
  const { dict } = useI18n();
  const greeting = useGreeting();

  return (
    <View style={styles.header}>
      <Text style={styles.greeting}>{greeting}</Text>
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
    <View style={styles.suggestions}>
      {dict.landing.suggestions.map((suggestion, index) => (
        <Pressable
          key={suggestion}
          onPress={() => onSuggestion(suggestion)}
          style={({ pressed }) => [
            styles.suggestionCard,
            pressed && styles.suggestionCardPressed,
          ]}
        >
          <View style={styles.suggestionIconWrap}>
            <Ionicons
              name={SUGGESTION_ICONS[index] ?? "chatbubble"}
              size={16}
              color="#007AFF"
            />
          </View>
          <Text style={styles.suggestionText} numberOfLines={2}>
            {suggestion}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color="rgba(235,235,245,0.3)"
            style={styles.suggestionChevron}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 16,
    fontWeight: "400",
    color: "rgba(235,235,245,0.6)",
    marginBottom: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.37,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: "rgba(235,235,245,0.6)",
    lineHeight: 20,
    letterSpacing: -0.24,
  },
  suggestions: {
    paddingHorizontal: 20,
    marginTop: 8,
    gap: 10,
  },
  suggestionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(118,118,128,0.12)",
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  suggestionCardPressed: {
    backgroundColor: "rgba(118,118,128,0.24)",
  },
  suggestionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0,122,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
    color: "#fff",
    letterSpacing: -0.24,
  },
  suggestionChevron: {
    marginLeft: 4,
  },
});
