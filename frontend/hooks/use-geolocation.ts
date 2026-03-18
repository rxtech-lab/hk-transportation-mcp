"use client";

import { useState, useCallback } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    loading: false,
    error: null,
  });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: "Geolocation not supported" }));
      return Promise.resolve(null);
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    return new Promise<{ latitude: number; longitude: number } | null>(
      (resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            setState({
              ...coords,
              loading: false,
              error: null,
            });
            resolve(coords);
          },
          (err) => {
            setState((prev) => ({
              ...prev,
              loading: false,
              error: err.message,
            }));
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    );
  }, []);

  return { ...state, request };
}
