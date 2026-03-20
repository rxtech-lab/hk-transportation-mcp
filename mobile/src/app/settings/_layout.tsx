import { Stack } from "expo-router";
import { useTheme } from "@/hooks/use-theme";

export default function SettingsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.headerBackground },
        headerTintColor: theme.headerTint,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: theme.backgroundSecondary },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Settings" }} />
      <Stack.Screen name="language" options={{ title: "Language" }} />
    </Stack>
  );
}
