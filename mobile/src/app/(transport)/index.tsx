import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  LandingHeader,
  SuggestionChips,
} from "@/components/landing/LandingView";
import { ChatInput } from "@/components/chat/ChatInput";
import { loadStoredMessages } from "@/hooks/useChatStorage";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dict } = useI18n();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    loadStoredMessages().then((stored) => {
      setHasSession(stored.length > 0);
    });
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      router.push({
        pathname: "/(transport)/chat",
        params: { initialMessage: text },
      });
    },
    [router],
  );

  const handleContinue = useCallback(() => {
    router.push("/(transport)/chat");
  }, [router]);

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
      ]}
    >
      <LandingHeader />
      {hasSession && (
        <Pressable onPress={handleContinue} style={styles.continueButton}>
          <Ionicons name="chatbubbles-outline" size={18} color="#60a5fa" />
          <Text style={styles.continueText}>{dict.landing.continueChat}</Text>
          <Ionicons name="chevron-forward" size={16} color="#60a5fa" />
        </Pressable>
      )}
      <ChatInput
        onSubmit={handleSend}
        placeholder={dict.chat.inputPlaceholder}
      />
      <SuggestionChips onSuggestion={handleSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#09090b",
    justifyContent: "center",
  },
  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(96,165,250,0.1)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.2)",
    marginBottom: 16,
  },
  continueText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#60a5fa",
  },
});
