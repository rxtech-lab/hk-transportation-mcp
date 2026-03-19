import { useState, useCallback } from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ChatInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSubmit,
  disabled,
  placeholder = "Ask about HK transportation...",
}: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setText("");
  }, [text, disabled, onSubmit]);

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#71717a"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          multiline
          numberOfLines={4}
          maxLength={2000}
          returnKeyType="send"
          editable={!disabled}
          textAlignVertical="top"
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[
            styles.sendButton,
            canSend ? styles.sendActive : styles.sendDisabled,
          ]}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? "#fff" : "#71717a"}
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 8,
    flexDirection: "column",
  },
  input: {
    color: "#fff",
    fontSize: 15,
    minHeight: 80,
    maxHeight: 160,
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
    backgroundColor: "#3b82f6",
  },
  sendDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
