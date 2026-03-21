import { useState, useMemo } from "react";
import { Stack } from "expo-router";
import { useDictionary } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";
import { ChatStreamProvider } from "@/contexts/ChatStreamContext";
import { MapDataContext, ArrivalsSheetContext, ToolCallSheetContext, type MapScreenData, type ArrivalsSheetData, type ToolCallSheetData } from "@/app/(transport)/_ctx";

export default function HistoryLayout() {
  const dict = useDictionary();
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
    <ChatStreamProvider>
    <MapDataContext value={mapCtx}>
      <ArrivalsSheetContext value={arrivalsCtx}>
        <ToolCallSheetContext value={toolCallCtx}>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "transparent" },
        headerTransparent: true,
        headerTintColor: theme.headerTint,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: theme.backgroundSecondary },
      }}
    >
      <Stack.Screen name="index" options={{ title: dict.history.title }} />
      <Stack.Screen
        name="chat"
        options={{
          title: dict.chat?.headerTitle ?? "",
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
          title: "",
          contentStyle: { backgroundColor: theme.backgroundSecondary },
        }}
      />
    </Stack>
        </ToolCallSheetContext>
      </ArrivalsSheetContext>
    </MapDataContext>
    </ChatStreamProvider>
  );
}
