import { useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UIMessage } from "ai";

const STORAGE_KEY = "hk-transport-chat";

export async function loadStoredMessages(): Promise<UIMessage[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useChatStorage(messages: UIMessage[]) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (messages.length > 0) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);
}

export async function clearChatStorage() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
