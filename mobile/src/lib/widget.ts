import { Platform } from "react-native";
import type { DisplayArrivalsInput } from "@/lib/types";

const APP_GROUP = "group.com.rxlab.hktransport";
const CONFIG_KEY = "widgetStopConfig";

export function updateWidget(data: DisplayArrivalsInput | null): void {
  if (Platform.OS !== "ios") return;

  try {
    const { ExtensionStorage } = require("@bacons/apple-targets");
    const storage = new ExtensionStorage(APP_GROUP);

    if (!data || !data.stops?.length) {
      storage.set(CONFIG_KEY, "");
      ExtensionStorage.reloadWidget();
      return;
    }

    const config = {
      title: data.title ?? "",
      stops: data.stops.map((stop: any) => ({
        id: stop.id || undefined,
        lat: stop.lat,
        lng: stop.lng,
      })),
    };

    const json = JSON.stringify(config);
    console.log("[Widget] setStopConfig:", json);
    storage.set(CONFIG_KEY, json);
    ExtensionStorage.reloadWidget();
  } catch (e) {
    console.warn("[Widget] bridge error:", e);
  }
}
