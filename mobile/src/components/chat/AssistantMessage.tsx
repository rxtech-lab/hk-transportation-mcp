import { View, StyleSheet } from "react-native";
import { isToolUIPart, type UIMessage } from "ai";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallBadge } from "./ToolCallBadge";
import { ArrivalCard } from "@/components/arrivals/ArrivalCard";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

export interface ToolCallInfo {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

interface AssistantMessageProps {
  message: UIMessage;
  toolPartsToRender: Set<string>;
  lastArrivalsToolCallId: string | null;
  arrivalsData?: DisplayArrivalsInput | null;
  fetchedArrivals?: Map<string, DisplayArrivalsInput>;
  onLocationClick?: (pin: LocationPin) => void;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onArrivalsExpand?: (data: DisplayArrivalsInput) => void;
  onToolPress?: (info: ToolCallInfo) => void;
}

export function AssistantMessage({
  message,
  toolPartsToRender,
  lastArrivalsToolCallId,
  arrivalsData,
  fetchedArrivals,
  onLocationClick,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
  onArrivalsExpand,
  onToolPress,
}: AssistantMessageProps) {
  return (
    <View style={styles.container}>
      {message.parts.map((part, j) => {
        if (part.type === "text" && part.text.trim()) {
          return (
            <MarkdownRenderer
              key={`text-${j}`}
              onLocationClick={onLocationClick}
            >
              {part.text}
            </MarkdownRenderer>
          );
        }

        if (
          isToolUIPart(part) &&
          toolPartsToRender.has(part.toolCallId)
        ) {
          const toolName =
            "toolName" in part
              ? String(part.toolName)
              : part.type.replace(/^tool-/, "");

          if (toolName === "display_arrivals" && part.input) {
            const isLatest =
              part.toolCallId === lastArrivalsToolCallId;
            const input = part.input as DisplayArrivalsInput;
            // Resolve card data: prefer live refresh > fetched from URL > inline stops
            const resolvedInput = input.stops?.length
              ? input
              : fetchedArrivals?.get(part.toolCallId) ?? input;
            const cardData =
              isLatest && arrivalsData
                ? arrivalsData
                : resolvedInput;
            return (
              <View key={part.toolCallId} style={styles.toolRow}>
                <ArrivalCard
                  data={cardData}
                  onLocationClick={onLocationClick}
                  stale={!isLatest}
                  lastRefreshedAt={
                    isLatest ? lastRefreshedAt : undefined
                  }
                  onRefresh={isLatest ? onRefresh : undefined}
                  isRefreshing={isLatest ? isRefreshing : undefined}
                  onHeaderPress={
                    onArrivalsExpand
                      ? () => onArrivalsExpand(cardData)
                      : undefined
                  }
                />
              </View>
            );
          }

          const partAny = part as Record<string, unknown>;
          const errorMsg =
            part.state === "output-error"
              ? partAny.output
                ? typeof partAny.output === "string"
                  ? partAny.output
                  : JSON.stringify(partAny.output)
                : "Connection interrupted — tap for details"
              : undefined;

          return (
            <View key={part.toolCallId} style={styles.toolRow}>
              <ToolCallBadge
                toolName={toolName}
                state={part.state}
                errorMessage={errorMsg}
                onPress={
                  onToolPress
                    ? () =>
                        onToolPress({
                          toolName,
                          state: part.state,
                          input: "input" in part ? part.input : undefined,
                          output: "output" in part ? part.output : undefined,
                        })
                    : undefined
                }
              />
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    gap: 4,
  },
  toolRow: {
    marginVertical: 4,
  },
});
