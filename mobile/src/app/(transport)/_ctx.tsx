import { createContext } from "react";
import type { LocationPin } from "@/lib/types";

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
