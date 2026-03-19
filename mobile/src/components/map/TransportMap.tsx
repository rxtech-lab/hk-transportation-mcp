import { useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import { Platform, StyleSheet, View, Text } from "react-native";
import MapView, {
  Marker,
  Polyline,
  Callout,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import { HK_CENTER } from "@/constants/map";
import { StopMarker } from "./StopMarker";
import type { MapData, MapStop, LocationPin } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";

interface TransportMapProps {
  mapData: MapData;
  userLocation: { latitude: number; longitude: number } | null;
  selectedPin?: LocationPin | null;
}

export const TransportMap = forwardRef<MapView, TransportMapProps>(function TransportMap(
  { mapData, userLocation, selectedPin },
  ref
) {
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => mapRef.current!, []);

  // Fit to coordinates when stops change
  useEffect(() => {
    if (!mapRef.current) return;

    const allCoords = [
      ...mapData.stops.map((s) => ({ latitude: s.lat, longitude: s.lng })),
      ...mapData.routes.flatMap((r) =>
        r.stops.map((s) => ({ latitude: s.lat, longitude: s.lng }))
      ),
    ];

    if (allCoords.length === 0) return;

    if (allCoords.length === 1) {
      mapRef.current.animateToRegion(
        {
          ...allCoords[0],
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000
      );
      return;
    }

    mapRef.current.fitToCoordinates(allCoords, {
      edgePadding: { top: 80, right: 60, bottom: 260, left: 60 },
      animated: true,
    });
  }, [mapData]);

  // Fly to selected pin
  useEffect(() => {
    if (!selectedPin || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: selectedPin.lat,
        longitude: selectedPin.lng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      },
      1000
    );
  }, [selectedPin]);

  const initialRegion = useMemo(
    () =>
      selectedPin
        ? {
            latitude: selectedPin.lat,
            longitude: selectedPin.lng,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }
        : {
            ...HK_CENTER,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          },
    [] // Only compute on mount
  );

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
      initialRegion={initialRegion}
      showsUserLocation
      showsMyLocationButton={false}
      mapType="standard"
    >
      {/* Route polylines */}
      {mapData.routes.map((route, i) => (
        <Polyline
          key={`route-${i}`}
          coordinates={route.stops.map((s) => ({
            latitude: s.lat,
            longitude: s.lng,
          }))}
          strokeColor={route.color}
          strokeWidth={3.5}
          lineJoin="round"
          lineCap="round"
        />
      ))}

      {/* Stop markers */}
      {mapData.stops.map((stop, i) => (
        <Marker
          key={`stop-${stop.lat}-${stop.lng}-${i}`}
          coordinate={{ latitude: stop.lat, longitude: stop.lng }}
        >
          <StopMarker stop={stop} />
          <Callout tooltip>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{stop.name}</Text>
              {stop.arrivals && stop.arrivals.length > 0 ? (
                stop.arrivals.slice(0, 4).map((arrival, j) => (
                  <View key={j} style={styles.calloutArrival}>
                    <View style={styles.calloutBadge}>
                      <Ionicons name="bus" size={10} color="#a1a1aa" />
                      <Text style={styles.calloutRoute}>
                        {arrival.route}
                      </Text>
                    </View>
                    {arrival.etas.slice(0, 3).map((eta, k) => (
                      <Text key={k} style={styles.calloutEta}>
                        {eta.minutes <= 0
                          ? "Dep"
                          : `${eta.minutes}m`}
                      </Text>
                    ))}
                  </View>
                ))
              ) : (
                <Text style={styles.calloutCoords}>
                  {stop.lat.toFixed(6)}, {stop.lng.toFixed(6)}
                </Text>
              )}
            </View>
          </Callout>
        </Marker>
      ))}

      {/* Selected pin marker */}
      {selectedPin && (
        <Marker
          coordinate={{
            latitude: selectedPin.lat,
            longitude: selectedPin.lng,
          }}
          pinColor="red"
        >
          <Callout>
            <View style={styles.pinCallout}>
              <Text style={styles.pinCalloutTitle}>{selectedPin.name}</Text>
              <Text style={styles.pinCalloutCoords}>
                {selectedPin.lat.toFixed(6)}, {selectedPin.lng.toFixed(6)}
              </Text>
            </View>
          </Callout>
        </Marker>
      )}
    </MapView>
  );
});

const styles = StyleSheet.create({
  callout: {
    backgroundColor: "#18181b",
    borderRadius: 12,
    padding: 12,
    minWidth: 160,
    maxWidth: 280,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 6,
  },
  calloutArrival: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  calloutBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  calloutRoute: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  calloutEta: {
    fontSize: 10,
    color: "#a1a1aa",
  },
  calloutCoords: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 2,
  },
  pinCallout: {
    padding: 8,
    minWidth: 120,
  },
  pinCalloutTitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  pinCalloutCoords: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 2,
  },
});
