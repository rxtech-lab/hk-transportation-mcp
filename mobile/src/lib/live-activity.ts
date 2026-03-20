import { Platform } from "react-native";
import { BACKEND_URL } from "@/lib/config";

let running = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let trackedParams: {
  route: string;
  stopName: string;
  stopId: string;
  destination: string;
} | null = null;

export async function startTracking(params: {
  route: string;
  stopName: string;
  stopId: string;
  destination: string;
  etas: { minutes: number; remarks?: string }[];
}): Promise<boolean> {
  if (Platform.OS !== "ios") return false;

  try {
    const { startLiveActivity } = require("../../modules/live-activity");
    await startLiveActivity({
      route: params.route,
      stopName: params.stopName,
      stopId: params.stopId,
      destination: params.destination,
      etas: params.etas.map((e) => ({
        minutes: e.minutes,
        remarks: e.remarks ?? "",
      })),
    });
    running = true;
    trackedParams = {
      route: params.route,
      stopName: params.stopName,
      stopId: params.stopId,
      destination: params.destination,
    };

    // Start periodic refresh every 30 seconds
    refreshTimer = setInterval(refreshActivity, 30_000);
    return true;
  } catch (e) {
    console.warn("[LiveActivity] startTracking error:", e);
    return false;
  }
}

async function refreshActivity(): Promise<void> {
  if (!running || !trackedParams) return;

  try {
    const { updateLiveActivity } = require("../../modules/live-activity");
    const res = await fetch(`${BACKEND_URL}/api/arrivals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stops: [{ id: trackedParams.stopId }],
      }),
    });

    if (!res.ok) return;

    const data = await res.json();
    const stop = data?.stops?.[0];
    if (!stop) return;

    // Find the tracked route's arrivals
    const arrival = stop.arrivals?.find(
      (a: { route: string }) => a.route === trackedParams!.route
    );
    if (!arrival) return;

    const etas = (arrival.etas ?? []).map(
      (e: { minutes: number; remarks?: string }) => ({
        minutes: e.minutes,
        remarks: e.remarks ?? "",
      })
    );

    await updateLiveActivity({ etas });
  } catch (e) {
    console.warn("[LiveActivity] refresh error:", e);
  }
}

export async function stopTracking(): Promise<void> {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (running && Platform.OS === "ios") {
    try {
      const { stopLiveActivity } = require("../../modules/live-activity");
      await stopLiveActivity();
    } catch (e) {
      console.warn("[LiveActivity] stopTracking error:", e);
    }
  }
  running = false;
  trackedParams = null;
}

export function isTracking(): boolean {
  return running;
}

export function getTrackedInfo(): {
  route: string;
  stopName: string;
  stopId: string;
  destination: string;
} | null {
  return trackedParams;
}
