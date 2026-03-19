import { useCallback } from "react";
import { Text } from "react-native";
import Markdown from "react-native-markdown-display";
import { LocationButton } from "@/components/ui/LocationButton";
import type { LocationPin } from "@/lib/types";

const COORD_HREF_REGEX = /^([0-9.-]+),\s*([0-9.-]+)$/;

const markdownStyles = {
  body: {
    color: "#e4e4e7",
    fontSize: 15,
    lineHeight: 22,
  },
  paragraph: {
    marginBottom: 8,
    marginTop: 0,
  },
  strong: {
    color: "#fff",
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
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#e4e4e7",
  },
  code_block: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    fontFamily: "monospace",
    color: "#e4e4e7",
  },
  table: {
    borderColor: "rgba(255,255,255,0.06)",
  },
  thead: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  th: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "500" as const,
    padding: 8,
    borderColor: "rgba(255,255,255,0.06)",
  },
  td: {
    color: "#e4e4e7",
    fontSize: 13,
    padding: 8,
    borderColor: "rgba(255,255,255,0.04)",
  },
};

export function MarkdownRenderer({
  children,
  onLocationClick,
}: {
  children: string;
  onLocationClick?: (pin: LocationPin) => void;
}) {
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
