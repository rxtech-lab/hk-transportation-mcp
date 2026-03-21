import { Stack } from "expo-router";
import { useDictionary } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";

export default function NearbyLayout() {
  const dict = useDictionary();
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "transparent" },
        headerTransparent: true,
        headerTintColor: theme.headerTint,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: theme.backgroundSecondary },
      }}
    >
      <Stack.Screen name="index" options={{ title: dict.nearby.title }} />
      <Stack.Screen
        name="route"
        options={{
          presentation: "formSheet",
          headerShown: true,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.backgroundSecondary },
        }}
      />
      <Stack.Screen
        name="map"
        options={{
          presentation: "formSheet",
          headerShown: true,
          headerShadowVisible: false,
          title: dict.map.title,
          contentStyle: { backgroundColor: theme.backgroundSecondary },
        }}
      />
    </Stack>
  );
}
