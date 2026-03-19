import { use, useCallback, useRef } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import MapView from "react-native-maps";
import { TransportMap } from "@/components/map/TransportMap";
import { StopListSheet } from "@/components/map/StopListSheet";
import { MapDataContext } from "./_ctx";
import type { MapStop } from "@/lib/types";

export default function MapScreen() {
  const { data } = use(MapDataContext);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const handleStopPress = useCallback(
    (stop: MapStop) => {
      mapRef.current?.animateToRegion(
        {
          latitude: stop.lat,
          longitude: stop.lng,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        800
      );
    },
    []
  );

  return (
    <View style={styles.root}>
      <TransportMap
        ref={mapRef}
        mapData={data.mapData}
        userLocation={data.userLocation}
        selectedPin={data.selectedPin}
      />
      <Pressable
        onPress={() => router.back()}
        style={[styles.closeButton, { top: insets.top + 12 }]}
      >
        <Ionicons name="close" size={22} color="#fff" />
      </Pressable>
      <StopListSheet
        stops={data.mapData.stops}
        onStopPress={handleStopPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
