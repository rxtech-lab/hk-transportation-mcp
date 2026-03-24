import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, AppState } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n, locales } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { locale, dict } = useI18n();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [locationStatus, setLocationStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");

  const checkLocationStatus = useCallback(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setLocationStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
    });
  }, []);

  useFocusEffect(useCallback(() => { checkLocationStatus(); }, [checkLocationStatus]));

  // Re-check when app returns from settings
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkLocationStatus();
    });
    return () => sub.remove();
  }, [checkLocationStatus]);

  const currentLabel = locales.find((l) => l.code === locale)?.label ?? locale;

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode?.toString();
  const versionDisplay = buildNumber ? `${appVersion} (${buildNumber})` : appVersion;

  const locationLabel =
    locationStatus === "granted"
      ? dict.settings.locationOn
      : locationStatus === "denied"
        ? dict.settings.locationOff
        : dict.settings.locationNotSet;

  const locationColor =
    locationStatus === "granted" ? "#34c759" : locationStatus === "denied" ? "#ff3b30" : theme.textTertiary;

  const handleLocationPress = () => {
    if (locationStatus === "granted") return;
    if (Platform.OS === "ios") {
      Linking.openURL("app-settings:");
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 44 }]}>
      <View style={[styles.section, { backgroundColor: theme.backgroundSecondary }]}>
        <Pressable
          onPress={() => router.push("/settings/language")}
          style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }]}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="language" size={20} color={theme.textTertiary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>{dict.settings.language}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowValue, { color: theme.textTertiary }]}>{currentLabel}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </View>
        </Pressable>

        <Pressable onPress={handleLocationPress} style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="location" size={20} color={theme.textTertiary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>{dict.settings.location}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowValue, { color: locationColor }]}>{locationLabel}</Text>
            {locationStatus !== "granted" && (
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            )}
          </View>
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: theme.backgroundSecondary, marginTop: 24 }]}>
        <Pressable
          onPress={() => router.push({ pathname: "/settings/legal", params: { type: "privacy" } })}
          style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.separator }]}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark" size={20} color={theme.textTertiary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>{dict.settings.privacyPolicy}</Text>
          </View>
          <View style={styles.rowRight}>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.push({ pathname: "/settings/legal", params: { type: "terms" } })}
          style={styles.row}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="document-text" size={20} color={theme.textTertiary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>{dict.settings.termsConditions}</Text>
          </View>
          <View style={styles.rowRight}>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </View>
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: theme.backgroundSecondary, marginTop: 24 }]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="information-circle" size={20} color={theme.textTertiary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>{dict.settings.version}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowValue, { color: theme.textTertiary }]}>{versionDisplay}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowLabel: {
    fontSize: 16,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: {
    fontSize: 15,
  },
});
