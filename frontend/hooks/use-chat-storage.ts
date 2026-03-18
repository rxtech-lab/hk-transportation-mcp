"use client";

import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";

const STORAGE_KEY = "hk-transport-chat";

export function loadStoredMessages(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function useChatStorage(messages: UIMessage[]) {
  const initialized = useRef(false);

  useEffect(() => {
    // Skip the initial render to avoid overwriting with empty array
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);
}

export function clearChatStorage() {
  localStorage.removeItem(STORAGE_KEY);
}
