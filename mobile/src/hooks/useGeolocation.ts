import { useState, useCallback, useRef } from "react";
import { Linking, Platform } from "react-native";
import * as Location from "expo-location";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    loading: false,
    error: null,
    permissionDenied: false,
  });

  const inflightRef = useRef<Promise<{ latitude: number; longitude: number } | null> | null>(null);

  const request = useCallback(async () => {
    // Deduplicate concurrent requests
    if (inflightRef.current) {
      return inflightRef.current;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const promise = (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Location permission denied",
            permissionDenied: true,
          }));
          return null;
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setState({ ...coords, loading: false, error: null, permissionDenied: false });
        return coords;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to get location";
        setState((prev) => ({ ...prev, loading: false, error: message }));
        return null;
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = promise;
    return promise;
  }, []);

  const openSettings = useCallback(() => {
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  }, []);

  return { ...state, request, openSettings };
}
