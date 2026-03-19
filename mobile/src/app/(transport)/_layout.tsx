import { useState, useMemo } from "react";
import { Stack } from "expo-router";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";
import { MapDataContext, type MapScreenData } from "./_ctx";

export default function TransportLayout() {
  const { dict } = useI18n();
  const theme = useTheme();
  const [data, setData] = useState<MapScreenData>({
    mapData: { stops: [], routes: [] },
    userLocation: null,
    selectedPin: null,
  });

  const ctxValue = useMemo(() => ({ data, setData }), [data]);

  return (
    <MapDataContext value={ctxValue}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBackground },
          headerTintColor: theme.headerTint,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: theme.backgroundSecondary },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat"
          options={{
            title: dict.chat.headerTitle,
            headerShadowVisible: false,
            headerTransparent: true,
            headerBlurEffect: theme.headerBlurEffect,
          }}
        />
        <Stack.Screen
          name="map"
          options={{
            presentation: "fullScreenModal",
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </Stack>
    </MapDataContext>
  );
}
