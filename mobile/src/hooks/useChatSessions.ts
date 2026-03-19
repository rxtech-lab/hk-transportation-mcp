import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { saveSessionMessages } from "@/lib/db";

export function useChatSessionStorage(
  sessionId: string | null,
  messages: UIMessage[],
) {
  const initialized = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (!sessionId || messages.length === 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveSessionMessages(sessionId, messages);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionId, messages]);
}
