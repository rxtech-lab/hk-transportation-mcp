import { useState, useEffect, useMemo } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator, Text } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { FRONTEND_URL } from "@/lib/config";

const BASE_FILES: Record<string, string> = {
  privacy: "privacy-policy",
  terms: "terms-conditions",
};

function getLocalizedFile(type: string, locale: string): string {
  const base = BASE_FILES[type] ?? BASE_FILES.privacy;
  if (locale === "en-US") return `${base}.md`;
  return `${base}.${locale}.md`;
}

function useLegalMarkdownStyles() {
  const theme = useTheme();
  return useMemo(() => ({
    body: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 24,
    },
    heading1: {
      fontSize: 24,
      fontWeight: "700" as const,
      color: theme.text,
      marginTop: 24,
      marginBottom: 8,
    },
    heading2: {
      fontSize: 20,
      fontWeight: "600" as const,
      color: theme.text,
      marginTop: 20,
      marginBottom: 6,
    },
    heading3: {
      fontSize: 17,
      fontWeight: "600" as const,
      color: theme.text,
      marginTop: 16,
      marginBottom: 4,
    },
    paragraph: {
      marginBottom: 12,
      marginTop: 0,
    },
    strong: {
      color: theme.text,
      fontWeight: "600" as const,
    },
    bullet_list: {
      marginBottom: 12,
    },
    ordered_list: {
      marginBottom: 12,
    },
    list_item: {
      marginBottom: 6,
    },
    link: {
      color: "#007AFF",
      textDecorationLine: "none" as const,
    },
  }), [theme]);
}

export default function LegalScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const theme = useTheme();
  const { locale, dict } = useI18n();
  const insets = useSafeAreaInsets();
  const markdownStyles = useLegalMarkdownStyles();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const title = type === "privacy" ? dict.settings.privacyPolicy : dict.settings.termsConditions;
  const fileKey = type ?? "privacy";

  useEffect(() => {
    const localizedFile = getLocalizedFile(fileKey, locale);
    const fallbackFile = getLocalizedFile(fileKey, "en-US");

    fetch(`${FRONTEND_URL}/${localizedFile}`)
      .then((res) => {
        if (!res.ok) return fetch(`${FRONTEND_URL}/${fallbackFile}`);
        return res;
      })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, [fileKey, locale]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 56 }]}>
      <Stack.Screen options={{ title }} />
      {content ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Markdown style={markdownStyles}>{content}</Markdown>
        </ScrollView>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: theme.textTertiary }}>Failed to load content.</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textTertiary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scroll: {
    paddingBottom: 100,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
