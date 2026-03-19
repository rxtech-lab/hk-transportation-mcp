import { useState, useCallback } from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

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

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(trimmed);
    setText("");
  }, [text, disabled, onSubmit]);

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View style={styles.container}>
      <View style={[styles.inputWrapper, compact && styles.inputWrapperCompact]}>
        <TextInput
          style={[styles.input, compact && styles.inputCompact]}
          placeholder={placeholder}
          placeholderTextColor="rgba(235,235,245,0.3)"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          multiline
          numberOfLines={compact ? 1 : 4}
          maxLength={2000}
          returnKeyType="send"
          editable={!disabled}
          textAlignVertical={compact ? "center" : "top"}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendButton,
            canSend ? styles.sendActive : styles.sendDisabled,
            pressed && canSend && styles.sendPressed,
          ]}
          hitSlop={8}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? "#fff" : "rgba(235,235,245,0.3)"}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inputWrapper: {
    backgroundColor: "rgba(118,118,128,0.12)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 8,
    flexDirection: "column",
  },
  inputWrapperCompact: {
    borderRadius: 22,
  },
  input: {
    color: "#fff",
    fontSize: 17,
    letterSpacing: -0.41,
    minHeight: 80,
    maxHeight: 160,
  },
  inputCompact: {
    minHeight: 22,
    maxHeight: 66,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    marginTop: 4,
  },
  sendActive: {
    backgroundColor: "#007AFF",
  },
  sendDisabled: {
    backgroundColor: "rgba(118,118,128,0.12)",
  },
  sendPressed: {
    opacity: 0.7,
  },
});
