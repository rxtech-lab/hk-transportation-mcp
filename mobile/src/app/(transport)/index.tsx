import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  LandingHeader,
  SuggestionChips,
} from "@/components/landing/LandingView";
import { ChatInput } from "@/components/chat/ChatInput";
import { useTheme } from "@/hooks/use-theme";
import { createSession, listSessions, migrateLegacyData } from "@/lib/db";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dict } = useI18n();
  const theme = useTheme();
  const [hasSession, setHasSession] = useState(false);
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useFocusEffect(
    useCallback(() => {
      migrateLegacyData().then(() => {
        const sessions = listSessions();
        setHasSession(sessions.length > 0);
        setLatestSessionId(sessions.length > 0 ? sessions[0].id : null);
      });
    }, []),
  );

  const handleSend = useCallback(
    (text: string) => {
      const session = createSession();
      router.push({
        pathname: "/(transport)/chat",
        params: { initialMessage: text, sessionId: session.id },
      });
    },
    [router],
  );

  const handleContinue = useCallback(() => {
    if (latestSessionId) {
      router.push({
        pathname: "/(transport)/chat",
        params: { sessionId: latestSessionId },
      });
    }
  }, [router, latestSessionId]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 16, backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <Pressable style={styles.content} onPress={Keyboard.dismiss}>
        <LandingHeader />

        {hasSession && (
          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.continueRow,
              { backgroundColor: theme.inputBackground },
              pressed && styles.continueRowPressed,
            ]}
          >
            <View style={styles.continueIconWrap}>
              <Ionicons name="chatbubbles" size={16} color="#007AFF" />
            </View>
            <Text style={[styles.continueText, { color: theme.text }]}>{dict.landing.continueChat}</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.chevronColor}
            />
          </Pressable>
        )}

        <SuggestionChips onSuggestion={handleSend} />
      </Pressable>

      <View style={[styles.inputArea, { paddingBottom: keyboardVisible ? 0 : insets.bottom, borderTopColor: theme.separator, backgroundColor: theme.background }]}>
        <ChatInput
          onSubmit={handleSend}
          placeholder={dict.chat.inputPlaceholder}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  continueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  continueRowPressed: {
    opacity: 0.7,
  },
  continueIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(0,122,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  continueText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "400",
    letterSpacing: -0.24,
  },
  inputArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
