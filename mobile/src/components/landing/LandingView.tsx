import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";

const DEFAULT_ICONS: Record<number, keyof typeof Ionicons.glyphMap> = {
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
  const theme = useTheme();
  const greeting = useGreeting();

  return (
    <View style={styles.header}>
      <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting}</Text>
      <Text style={[styles.title, { color: theme.text }]}>{dict.landing.title}</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{dict.landing.subtitle}</Text>
    </View>
  );
}

export interface SuggestionItem {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export function SuggestionChips({
  onSuggestion,
  items,
}: {
  onSuggestion: (text: string) => void;
  items?: SuggestionItem[];
}) {
  const { dict } = useI18n();
  const theme = useTheme();

  const chips: SuggestionItem[] =
    items ??
    dict.landing.suggestions.map((text, i) => ({
      text,
      icon: DEFAULT_ICONS[i] ?? "chatbubble",
    }));

  return (
    <View style={styles.suggestions}>
      {chips.map((chip) => (
        <Pressable
          key={chip.text}
          onPress={() => onSuggestion(chip.text)}
          style={({ pressed }) => [
            styles.suggestionCard,
            { backgroundColor: theme.inputBackground },
            pressed && styles.suggestionCardPressed,
          ]}
        >
          <View style={styles.suggestionIconWrap}>
            <Ionicons
              name={chip.icon}
              size={16}
              color="#007AFF"
            />
          </View>
          <Text style={[styles.suggestionText, { color: theme.text }]} numberOfLines={2}>
            {chip.text}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={theme.chevronColor}
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
    marginBottom: 4,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 0.37,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
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
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  suggestionCardPressed: {
    opacity: 0.7,
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
    letterSpacing: -0.24,
  },
  suggestionChevron: {
    marginLeft: 4,
  },
});
