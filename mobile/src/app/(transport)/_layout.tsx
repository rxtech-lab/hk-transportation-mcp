import { useState, useMemo } from "react";
import { Stack } from "expo-router";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";
import { MapDataContext, ArrivalsSheetContext, ToolCallSheetContext, type MapScreenData, type ArrivalsSheetData, type ToolCallSheetData } from "./_ctx";

export default function TransportLayout() {
  const { dict } = useI18n();
  const theme = useTheme();
  const [data, setData] = useState<MapScreenData>({
    mapData: { stops: [], routes: [] },
    userLocation: null,
    selectedPin: null,
  });
  const [sheetData, setSheetData] = useState<ArrivalsSheetData | null>(null);
  const [toolCallData, setToolCallData] = useState<ToolCallSheetData | null>(null);

  const mapCtx = useMemo(() => ({ data, setData }), [data]);
  const arrivalsCtx = useMemo(() => ({ sheetData, setSheetData }), [sheetData]);
  const toolCallCtx = useMemo(() => ({ toolCallData, setToolCallData }), [toolCallData]);

  return (
    <MapDataContext value={mapCtx}>
      <ArrivalsSheetContext value={arrivalsCtx}>
        <ToolCallSheetContext value={toolCallCtx}>
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
              headerStyle: { backgroundColor: "transparent" },
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
          <Stack.Screen
            name="arrivals"
            options={{
              presentation: "formSheet",
              headerShown: true,
              headerShadowVisible: false,
              title: "",
              contentStyle: { backgroundColor: theme.backgroundSecondary },
            }}
          />
          <Stack.Screen
            name="tool-call"
            options={{
              presentation: "formSheet",
              headerShown: true,
              headerShadowVisible: false,
              headerTransparent: true,
              headerStyle: { backgroundColor: "transparent" },
              headerBlurEffect: undefined,
              title: "",
              contentStyle: { backgroundColor: theme.backgroundSecondary },
            }}
          />
        </Stack>
        </ToolCallSheetContext>
      </ArrivalsSheetContext>
    </MapDataContext>
  );
}
