import { createContext } from "react";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

export interface MapScreenData {
  mapData: { stops: any[]; routes: any[] };
  userLocation: { latitude: number; longitude: number } | null;
  selectedPin: LocationPin | null;
}

export const MapDataContext = createContext<{
  data: MapScreenData;
  setData: (data: MapScreenData) => void;
}>({
  data: { mapData: { stops: [], routes: [] }, userLocation: null, selectedPin: null },
  setData: () => {},
});

export interface ArrivalsSheetData {
  data: DisplayArrivalsInput;
  onLocationClick?: (pin: LocationPin) => void;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const ArrivalsSheetContext = createContext<{
  sheetData: ArrivalsSheetData | null;
  setSheetData: (data: ArrivalsSheetData | null) => void;
}>({
  sheetData: null,
  setSheetData: () => {},
});

export interface ToolCallSheetData {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}

export const ToolCallSheetContext = createContext<{
  toolCallData: ToolCallSheetData | null;
  setToolCallData: (data: ToolCallSheetData | null) => void;
}>({
  toolCallData: null,
  setToolCallData: () => {},
});
