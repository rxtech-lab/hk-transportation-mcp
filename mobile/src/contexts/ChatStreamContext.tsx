import {
  createContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useChat, type UseChatHelpers } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

import { useGeolocation } from "@/hooks/useGeolocation";
import { FRONTEND_URL } from "@/lib/config";
import { updateWidget } from "@/lib/widget";
import { startTracking } from "@/lib/live-activity";
import type { DisplayArrivalsInput } from "@/lib/types";

type ChatStreamContextValue = {
  currentChatId: string | null;
  setChatId: (
    id: string | null,
    options?: { messages?: UIMessage[]; regenerate?: boolean },
  ) => void;
  messages: UseChatHelpers<UIMessage>["messages"];
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  regenerate: UseChatHelpers<UIMessage>["regenerate"];
  status: UseChatHelpers<UIMessage>["status"];
  error: UseChatHelpers<UIMessage>["error"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  addToolOutput: UseChatHelpers<UIMessage>["addToolOutput"];
  geo: ReturnType<typeof useGeolocation>;
};

export const ChatStreamContext = createContext<ChatStreamContextValue>({
  currentChatId: null,
  setChatId: () => {},
  messages: [],
  sendMessage: () => Promise.resolve() as any,
  regenerate: () => Promise.resolve() as any,
  status: "ready",
  error: undefined,
  setMessages: () => {},
  addToolOutput: () => Promise.resolve() as any,
  geo: {
    latitude: null,
    longitude: null,
    loading: false,
    error: null,
    permissionDenied: false,
    request: () => Promise.resolve(null),
    openSettings: () => {},
  },
});

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const pendingRef = useRef<{
    messages?: UIMessage[];
    regenerate?: boolean;
  } | null>(null);
  const geo = useGeolocation();
  const geoRef = useRef(geo);
  geoRef.current = geo;

  const chatHookId = currentChatId
    ? `session-${currentChatId}`
    : "hk-transport-new";

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${FRONTEND_URL}/api/chat`,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        prepareSendMessagesRequest: ({ id, messages: msgs }) => ({
          body: {
            id,
            messages: msgs,
            capabilities: ["liveActivity"],
          },
        }),
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    regenerate,
    status,
    error,
    setMessages,
    addToolOutput,
  } = useChat({
    id: chatHookId,
    resume: true,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport,
    onToolCall({ toolCall }) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (toolCall.toolName === "display_arrivals") {
        updateWidget(toolCall.input as DisplayArrivalsInput);
        addToolOutput({
          tool: "display_arrivals" as never,
          toolCallId: toolCall.toolCallId,
          output: "Arrival card displayed to user.",
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      if (toolCall.toolName === "show_live_activity") {
        const input = toolCall.input as {
          route: string;
          stopName: string;
          stopId: string;
          destination: string;
          etas: { minutes: number; remarks?: string }[];
        };
        startTracking(input).then((ok) => {
          addToolOutput({
            tool: "show_live_activity" as never,
            toolCallId: toolCall.toolCallId,
            output: ok
              ? "Live Activity started. The user can now see real-time bus tracking on their Lock Screen and Dynamic Island."
              : "Failed to start Live Activity. The device may not support Live Activities or the user has disabled them.",
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        });
      }
      if (toolCall.toolName === "get_user_location") {
        const g = geoRef.current;
        if (g.latitude && g.longitude) {
          addToolOutput({
            tool: "get_user_location" as never,
            toolCallId: toolCall.toolCallId,
            output: JSON.stringify({
              latitude: g.latitude,
              longitude: g.longitude,
            }),
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          geoRef.current.request().then((coords) => {
            if (coords) {
              addToolOutput({
                tool: "get_user_location" as never,
                toolCallId: toolCall.toolCallId,
                output: JSON.stringify({
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                }),
              });
            } else {
              addToolOutput({
                tool: "get_user_location" as never,
                toolCallId: toolCall.toolCallId,
                output: JSON.stringify({
                  error:
                    "Location unavailable. The user may have denied location permission.",
                }),
              });
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          });
        }
      }
    },
  });

  // Apply pending messages after useChat settles with the new id
  useEffect(() => {
    if (!pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;

    if (pending.messages && pending.messages.length > 0) {
      setMessages(pending.messages);
    }
    if (pending.regenerate) {
      setTimeout(() => regenerate(), 0);
    }
  }, [chatHookId, setMessages, regenerate]);

  const setChatId = useCallback(
    (
      id: string | null,
      options?: { messages?: UIMessage[]; regenerate?: boolean },
    ) => {
      if (options) {
        pendingRef.current = options;
      }
      setCurrentChatId(id);
    },
    [],
  );

  return (
    <ChatStreamContext
      value={{
        currentChatId,
        setChatId,
        messages,
        sendMessage,
        regenerate,
        status,
        error,
        setMessages,
        addToolOutput,
        geo,
      }}
    >
      {children}
    </ChatStreamContext>
  );
}
