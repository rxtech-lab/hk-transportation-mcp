import { View, StyleSheet } from "react-native";
import { isToolUIPart, type UIMessage } from "ai";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallBadge } from "./ToolCallBadge";
import { ArrivalCard } from "@/components/arrivals/ArrivalCard";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

interface AssistantMessageProps {
  message: UIMessage;
  toolPartsToRender: Set<string>;
  lastArrivalsToolCallId: string | null;
  arrivalsData?: DisplayArrivalsInput | null;
  onLocationClick?: (pin: LocationPin) => void;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function AssistantMessage({
  message,
  toolPartsToRender,
  lastArrivalsToolCallId,
  arrivalsData,
  onLocationClick,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
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
            const cardData =
              isLatest && arrivalsData
                ? arrivalsData
                : (part.input as DisplayArrivalsInput);
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
                />
              </View>
            );
          }

          return (
            <View key={part.toolCallId} style={styles.toolRow}>
              <ToolCallBadge toolName={toolName} state={part.state} />
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
