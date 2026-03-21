import { Stack } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function SettingsLayout() {
  const theme = useTheme();
  const { dict } = useI18n();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "transparent" },
        headerTransparent: true,
        headerTintColor: theme.headerTint,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: dict.tabs.settings, headerShadowVisible: false }} />
      <Stack.Screen name="language" options={{ title: dict.settings.language, headerShadowVisible: false }} />
    </Stack>
  );
}
