import { Stack } from "expo-router";
import { useDictionary } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";

export default function HistoryLayout() {
  const dict = useDictionary();
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
      <Stack.Screen name="index" options={{ title: dict.history.title }} />
    </Stack>
  );
}
