import { useState, useCallback } from "react";
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/use-theme";
import { VoiceInputSheet } from "./VoiceInputSheet";

interface ChatInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export function ChatInput({
  onSubmit,
  disabled,
  placeholder = "Ask about HK transportation...",
  compact = false,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const theme = useTheme();

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(trimmed);
    setText("");
  }, [text, disabled, onSubmit]);

  const handleOpenVoice = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    setVoiceOpen(true);
  }, []);

  const handleVoiceInsert = useCallback((spoken: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
  }, []);

  const canSend = text.trim().length > 0 && !disabled;

  const micButton = (
    <Pressable
      onPress={handleOpenVoice}
      disabled={disabled}
      testID="voice-btn"
      style={({ pressed }) => [
        styles.micButton,
        compact && styles.micButtonCompact,
        pressed && styles.sendPressed,
      ]}
      hitSlop={8}
    >
      <Ionicons
        name="mic-outline"
        size={22}
        color={disabled ? theme.textTertiary : theme.textSecondary}
      />
    </Pressable>
  );

  const sendControl = disabled ? (
    <View
      style={[
        styles.sendButton,
        styles.sendLoading,
        compact && styles.sendButtonCompact,
      ]}
    >
      <ActivityIndicator size="small" color={theme.textTertiary} />
    </View>
  ) : (
    <Pressable
      onPress={handleSend}
      disabled={!canSend}
      testID="send-btn"
      style={({ pressed }) => [
        styles.sendButton,
        compact && styles.sendButtonCompact,
        canSend ? styles.sendActive : { backgroundColor: theme.inputBackground },
        pressed && canSend && styles.sendPressed,
      ]}
      hitSlop={8}
    >
      <Ionicons
        name="arrow-up"
        size={18}
        color={canSend ? "#fff" : theme.textTertiary}
      />
    </Pressable>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: theme.inputBackground },
          compact && styles.inputWrapperCompact,
        ]}
      >
        {compact ? micButton : null}
        <TextInput
          testID="chat-input-box"
          style={[
            styles.input,
            { color: theme.text },
            compact && styles.inputCompact,
          ]}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          multiline
          maxLength={2000}
          returnKeyType="send"
          editable={!disabled}
          textAlignVertical={compact ? "center" : "top"}
        />
        {compact ? (
          sendControl
        ) : (
          <View style={styles.actionRow}>
            {micButton}
            {sendControl}
          </View>
        )}
      </View>
      <VoiceInputSheet
        visible={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onInsert={handleVoiceInsert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  containerCompact: {
    paddingTop: 4,
    paddingBottom: 0,
    paddingHorizontal: 10,
  },
  inputWrapper: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 8,
    flexDirection: "column",
  },
  inputWrapperCompact: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  micButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonCompact: {
    marginRight: 2,
  },
  input: {
    fontSize: 17,
    letterSpacing: -0.41,
    minHeight: 80,
    maxHeight: 160,
  },
  inputCompact: {
    flex: 1,
    minHeight: 22,
    maxHeight: 66,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonCompact: {
    marginLeft: 6,
  },
  sendActive: {
    backgroundColor: "#007AFF",
  },
  sendLoading: {
    backgroundColor: "rgba(120,120,128,0.24)",
  },
  sendPressed: {
    opacity: 0.7,
  },
});
