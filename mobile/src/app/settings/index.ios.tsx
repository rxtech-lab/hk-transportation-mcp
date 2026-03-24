import { useState, useCallback, useEffect } from "react";
import { AppState, Linking, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import Constants from "expo-constants";
import {
  Host,
  List,
  Section,
  Text,
  Button,
  Label,
  HStack,
  Spacer,
  Image,
} from "@expo/ui/swift-ui";
import { listStyle, foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { useI18n, locales } from "@/lib/i18n/i18n-provider";

export default function SettingsScreen() {
  const router = useRouter();
  const { locale, dict } = useI18n();
  const [locationStatus, setLocationStatus] = useState<
    "granted" | "denied" | "undetermined"
  >("undetermined");

  const checkLocationStatus = useCallback(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setLocationStatus(
        status === "granted"
          ? "granted"
          : status === "denied"
            ? "denied"
            : "undetermined",
      );
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkLocationStatus();
    }, [checkLocationStatus]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkLocationStatus();
    });
    return () => sub.remove();
  }, [checkLocationStatus]);

  const currentLabel = locales.find((l) => l.code === locale)?.label ?? locale;

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber = Constants.expoConfig?.ios?.buildNumber;
  const versionDisplay = buildNumber
    ? `${appVersion} (${buildNumber})`
    : appVersion;

  const locationLabel =
    locationStatus === "granted"
      ? dict.settings.locationOn
      : locationStatus === "denied"
        ? dict.settings.locationOff
        : dict.settings.locationNotSet;

  const handleLocationPress = () => {
    if (locationStatus === "granted") return;
    Linking.openURL("app-settings:");
  };

  return (
    <Host style={{ flex: 1, marginTop: 100 }}>
      <List modifiers={[listStyle("insetGrouped")]}>
        <Section>
          <Button onPress={() => router.push("/settings/language")}>
            <HStack>
              <Label title={dict.settings.language} systemImage="globe" />
              <Spacer />
              <Text
                modifiers={[
                  foregroundStyle({ type: "hierarchical", style: "secondary" }),
                ]}
              >
                {currentLabel}
              </Text>
              <Image systemName="chevron.right" color="tertiary" size={12} />
            </HStack>
          </Button>

          <Button onPress={handleLocationPress}>
            <HStack>
              <Label title={dict.settings.location} systemImage="location" />
              <Spacer />
              <Text
                modifiers={[
                  foregroundStyle(
                    locationStatus === "granted"
                      ? "green"
                      : locationStatus === "denied"
                        ? "red"
                        : { type: "hierarchical", style: "secondary" },
                  ),
                ]}
              >
                {locationLabel}
              </Text>
              {locationStatus !== "granted" && (
                <Image systemName="chevron.right" color="tertiary" size={12} />
              )}
            </HStack>
          </Button>
        </Section>

        <Section>
          <Button
            onPress={() =>
              router.push({
                pathname: "/settings/legal",
                params: { type: "privacy" },
              })
            }
          >
            <HStack>
              <Label
                title={dict.settings.privacyPolicy}
                systemImage="hand.raised"
              />
              <Spacer />
              <Image systemName="chevron.right" color="tertiary" size={12} />
            </HStack>
          </Button>

          <Button
            onPress={() =>
              router.push({
                pathname: "/settings/legal",
                params: { type: "terms" },
              })
            }
          >
            <HStack>
              <Label
                title={dict.settings.termsConditions}
                systemImage="doc.text"
              />
              <Spacer />
              <Image systemName="chevron.right" color="tertiary" size={12} />
            </HStack>
          </Button>
        </Section>

        <Section>
          <HStack>
            <Label title={dict.settings.version} systemImage="info.circle" />
            <Spacer />
            <Text
              modifiers={[
                foregroundStyle({ type: "hierarchical", style: "secondary" }),
              ]}
            >
              {versionDisplay}
            </Text>
          </HStack>
        </Section>
      </List>
    </Host>
  );
}
