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
import { FRONTEND_URL, BACKEND_URL } from "@/lib/config";
import { updateWidget } from "@/lib/widget";
import { startTracking } from "@/lib/live-activity";
import type { DisplayArrivalsInput } from "@/lib/types";

async function fetchArrivalsFromURL(
  url: string,
): Promise<DisplayArrivalsInput> {
  // Rewrite the host to BACKEND_URL so it works in the mobile environment
  const parsed = new URL(url);
  const backend = new URL(BACKEND_URL);
  parsed.protocol = backend.protocol;
  parsed.host = backend.host;
  const res = await fetch(parsed.toString());
  if (!res.ok) throw new Error("Failed to fetch arrivals from URL");
  const data = await res.json();
  return { stops: data.stops ?? [] };
}

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
  fetchedArrivals: React.RefObject<Map<string, DisplayArrivalsInput>>;
  fetchedArrivalsVersion: number;
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
  fetchedArrivals: { current: new Map() },
  fetchedArrivalsVersion: 0,
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
  const fetchedArrivals = useRef(new Map<string, DisplayArrivalsInput>());
  const [fetchedArrivalsVersion, setFetchedArrivalsVersion] = useState(0);

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
        const input = toolCall.input as DisplayArrivalsInput;
        // Always send tool output immediately so the AI stream doesn't stall
        addToolOutput({
          tool: "display_arrivals" as never,
          toolCallId: toolCall.toolCallId,
          output: "Arrival card displayed to user.",
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (input.url && !input.stops?.length) {
          // URL-based flow: fetch data from backend URL in background
          fetchArrivalsFromURL(input.url)
            .then((resolved) => {
              const data = { ...resolved, title: input.title, url: input.url };
              fetchedArrivals.current.set(toolCall.toolCallId, data);
              setFetchedArrivalsVersion((v) => v + 1);
              updateWidget(data);
            })
            .catch(() => {
              // Fetch failed; card will show loading state
            });
        } else {
          // Legacy flow: stops data passed directly
          updateWidget(input);
        }
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

  // Apply pending messages after useChat settles with the new id.
  // Skip the initial mount — on first render, child effects (ChatScreen restore)
  // set pendingRef before this parent effect runs, but chatHookId hasn't changed
  // yet, so setMessages would target the wrong chat instance.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
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
        fetchedArrivals,
        fetchedArrivalsVersion,
      }}
    >
      {children}
    </ChatStreamContext>
  );
}
