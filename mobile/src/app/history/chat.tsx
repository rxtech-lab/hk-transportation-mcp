import { useState, useMemo } from "react";
import { MapDataContext, ArrivalsSheetContext, ToolCallSheetContext, type MapScreenData, type ArrivalsSheetData, type ToolCallSheetData } from "@/app/(transport)/_ctx";
import ChatScreen from "@/app/(transport)/chat";

export default function HistoryChatScreen() {
  const [mapData, setMapData] = useState<MapScreenData>({
    mapData: { stops: [], routes: [] },
    userLocation: null,
    selectedPin: null,
  });
  const [sheetData, setSheetData] = useState<ArrivalsSheetData | null>(null);
  const [toolCallData, setToolCallData] = useState<ToolCallSheetData | null>(null);

  const mapCtx = useMemo(() => ({ data: mapData, setData: setMapData }), [mapData]);
  const arrivalsCtx = useMemo(() => ({ sheetData, setSheetData }), [sheetData]);
  const toolCallCtx = useMemo(() => ({ toolCallData, setToolCallData }), [toolCallData]);

  return (
    <MapDataContext value={mapCtx}>
      <ArrivalsSheetContext value={arrivalsCtx}>
        <ToolCallSheetContext value={toolCallCtx}>
          <ChatScreen />
        </ToolCallSheetContext>
      </ArrivalsSheetContext>
    </MapDataContext>
  );
}
