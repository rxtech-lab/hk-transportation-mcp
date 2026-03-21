import { useMemo } from "react";
import { StyleSheet, Platform, Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

export default function NearbyMapScreen() {
  const { name, lat, lng } = useLocalSearchParams<{
    name: string;
    lat: string;
    lng: string;
  }>();
  const router = useRouter();
  const theme = useTheme();

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  const region = useMemo(
    () => ({
      latitude,
      longitude,
      latitudeDelta: 0.003,
      longitudeDelta: 0.003,
    }),
    [latitude, longitude],
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton
        mapType="standard"
      >
        <Marker
          coordinate={{ latitude, longitude }}
          title={name}
        />
      </MapView>
    </>
  );
}
