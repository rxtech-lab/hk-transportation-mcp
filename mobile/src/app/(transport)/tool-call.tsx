import { use, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { useThemeMode } from "@/hooks/use-theme";
import { ToolCallSheetContext } from "./_ctx";

interface JsonToken {
  text: string;
  type: "key" | "string" | "number" | "boolean" | "null" | "bracket" | "punct";
}

const syntaxColors = {
  dark: {
    key: "#79c0ff",
    string: "#a5d6ff",
    number: "#f2cc60",
    boolean: "#ff7b72",
    null: "#ff7b72",
    bracket: "#8b949e",
    punct: "#8b949e",
  },
  light: {
    key: "#0550ae",
    string: "#0a3069",
    number: "#953800",
    boolean: "#cf222e",
    null: "#cf222e",
    bracket: "#57606a",
    punct: "#57606a",
  },
};

function tokenizeJson(data: unknown): JsonToken[] {
  let json: string;
  try {
    json = JSON.stringify(data, null, 2);
  } catch {
    return [{ text: String(data), type: "string" }];
  }

  const tokens: JsonToken[] = [];
  const regex =
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([\[\]{}])|([,:])|(\s+)/g;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(json)) !== null) {
    // capture any unmatched text
    if (match.index > lastIndex) {
      tokens.push({ text: json.slice(lastIndex, match.index), type: "punct" });
    }
    lastIndex = regex.lastIndex;

    if (match[1] !== undefined) {
      // key
      tokens.push({ text: match[1], type: "key" });
      tokens.push({ text: ": ", type: "punct" });
    } else if (match[2] !== undefined) {
      tokens.push({ text: match[2], type: "string" });
    } else if (match[3] !== undefined) {
      tokens.push({ text: match[3], type: "number" });
    } else if (match[4] !== undefined) {
      tokens.push({ text: match[4], type: "boolean" });
    } else if (match[5] !== undefined) {
      tokens.push({ text: match[5], type: "null" });
    } else if (match[6] !== undefined) {
      tokens.push({ text: match[6], type: "bracket" });
    } else if (match[7] !== undefined) {
      tokens.push({ text: match[7], type: "punct" });
    } else if (match[8] !== undefined) {
      // whitespace — keep as punct
      tokens.push({ text: match[8], type: "punct" });
    }
  }

  if (lastIndex < json.length) {
    tokens.push({ text: json.slice(lastIndex), type: "punct" });
  }

  return tokens;
}

function HighlightedJson({ data }: { data: unknown }) {
  const mode = useThemeMode();
  const colors = syntaxColors[mode];

  const tokens = useMemo(() => tokenizeJson(data), [data]);

  return (
    <Text selectable style={styles.codeText}>
      {tokens.map((token, i) => (
        <Text key={i} style={{ color: colors[token.type] }}>
          {token.text}
        </Text>
      ))}
    </Text>
  );
}

export default function ToolCallSheet() {
  const theme = useTheme();
  const router = useRouter();
  const { toolCallData } = use(ToolCallSheetContext);

  if (!toolCallData) return null;

  const stateColor =
    toolCallData.state === "output-available"
      ? "#4ade80"
      : toolCallData.state === "output-error"
        ? "#f87171"
        : theme.textTertiary;

  return (
    <>
      <Stack.Screen
        options={{
          title: toolCallData.toolName,
          headerTitleStyle: { fontFamily: "monospace", fontSize: 15, fontWeight: "600" },
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.stateRow, { borderBottomColor: theme.separator }]}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            Status
          </Text>
          <Text style={[styles.stateValue, { color: stateColor }]}>
            {toolCallData.state}
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          Input
        </Text>
        <View
          style={[
            styles.codeBlock,
            {
              backgroundColor: theme.codeBackground,
              borderColor: theme.codeBorder,
            },
          ]}
        >
          {toolCallData.input != null ? (
            <HighlightedJson data={toolCallData.input} />
          ) : (
            <Text style={[styles.codeText, { color: theme.textTertiary }]}>—</Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          Output
        </Text>
        <View
          style={[
            styles.codeBlock,
            {
              backgroundColor: theme.codeBackground,
              borderColor: theme.codeBorder,
            },
          ]}
        >
          {toolCallData.output != null ? (
            <HighlightedJson data={toolCallData.output} />
          ) : (
            <Text style={[styles.codeText, { color: theme.textTertiary }]}>—</Text>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  stateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
  },
  stateValue: {
    fontSize: 13,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  codeBlock: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 12,
    fontFamily: "monospace",
    lineHeight: 18,
  },
});
