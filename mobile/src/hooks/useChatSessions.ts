import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { saveSessionMessages } from "@/lib/db";

export function useChatSessionStorage(
  sessionId: string | null,
  messages: UIMessage[],
) {
  const initialized = useRef(false);
  const loadedCountRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      // Remember the initial message count so we can skip re-saving
      // when messages are loaded from history without changes
      loadedCountRef.current = messages.length;
      return;
    }
    if (!sessionId || messages.length === 0) return;

    // Skip saving when loaded messages haven't changed (viewing history)
    if (loadedCountRef.current !== null && messages.length === loadedCountRef.current) {
      return;
    }
    // Once messages actually change, clear the guard
    loadedCountRef.current = null;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveSessionMessages(sessionId, messages);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionId, messages]);
}
