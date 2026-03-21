import { useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";

function PulsingDots({ color }: { color: string }) {
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [anims]);

  return (
    <View style={styles.dotsRow}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: color },
            {
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1.2],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export function ToolCallBadge({
  toolName,
  state,
  onPress,
}: {
  toolName: string;
  state: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const isDone = state === "output-available";
  const isError = state === "output-error";

  const bgColor = isDone
    ? "rgba(34,197,94,0.1)"
    : isError
      ? "rgba(239,68,68,0.1)"
      : theme.toolPendingBackground;
  const textColor = isDone
    ? "#4ade80"
    : isError
      ? "#f87171"
      : theme.textTertiary;

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <Ionicons name="construct" size={12} color={textColor} />
        <Animated.Text style={[styles.text, { color: textColor }]}>
          {toolName}
        </Animated.Text>
        {!isDone && !isError && <PulsingDots color={textColor} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "monospace",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 3,
    marginLeft: 2,
    alignItems: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
