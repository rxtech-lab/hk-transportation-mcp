import { useCallback, useMemo } from "react";
import { Text } from "react-native";
import Markdown from "react-native-markdown-display";
import { LocationButton } from "@/components/ui/LocationButton";
import { useTheme } from "@/hooks/use-theme";
import type { LocationPin } from "@/lib/types";

const COORD_HREF_REGEX = /^([0-9.-]+),\s*([0-9.-]+)$/;

function useMarkdownStyles() {
  const theme = useTheme();
  return useMemo(() => ({
    body: {
      color: theme.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    paragraph: {
      marginBottom: 8,
      marginTop: 0,
    },
    strong: {
      color: theme.text,
      fontWeight: "600" as const,
    },
    link: {
      color: "#60a5fa",
      textDecorationLine: "underline" as const,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      marginBottom: 4,
    },
    code_inline: {
      backgroundColor: theme.codeBackground,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      fontSize: 13,
      fontFamily: "monospace",
      color: theme.textSecondary,
    },
    code_block: {
      backgroundColor: theme.codeBackground,
      borderRadius: 8,
      padding: 12,
      fontSize: 13,
      fontFamily: "monospace",
      color: theme.textSecondary,
    },
    table: {
      borderColor: theme.codeBorder,
    },
    thead: {
      backgroundColor: theme.tableHeaderBackground,
    },
    th: {
      color: theme.textTertiary,
      fontSize: 12,
      fontWeight: "500" as const,
      padding: 8,
      borderColor: theme.codeBorder,
    },
    td: {
      color: theme.textSecondary,
      fontSize: 13,
      padding: 8,
      borderColor: theme.separatorLight,
    },
  }), [theme]);
}

export function MarkdownRenderer({
  children,
  onLocationClick,
}: {
  children: string;
  onLocationClick?: (pin: LocationPin) => void;
}) {
  const markdownStyles = useMarkdownStyles();

  // Strip 📍 emoji from text
  const cleaned = children.replace(/📍/g, "");

  const rules = useCallback(
    () => ({
      link: (
        node: any,
        childrenNodes: any,
        _parent: any,
        styles: any
      ) => {
        const href = node.attributes?.href ?? "";
        const match = COORD_HREF_REGEX.exec(href);
        if (match) {
          const lat = parseFloat(match[1]);
          const lng = parseFloat(match[2]);
          // Extract text content from children
          const name =
            node.children
              ?.map((c: any) => c.content ?? "")
              .join("")
              .trim() || "Location";
          return (
            <LocationButton
              key={node.key}
              name={name}
              lat={lat}
              lng={lng}
              onPress={onLocationClick}
            />
          );
        }
        return (
          <Text key={node.key} style={styles.link}>
            {childrenNodes}
          </Text>
        );
      },
    }),
    [onLocationClick]
  );

  return (
    <Markdown style={markdownStyles} rules={rules()}>
      {cleaned}
    </Markdown>
  );
}
