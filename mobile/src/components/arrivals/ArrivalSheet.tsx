import { useCallback } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { ArrivalCard } from "./ArrivalCard";
import { useTheme } from "@/hooks/use-theme";
import type { DisplayArrivalsInput, LocationPin } from "@/lib/types";

interface ArrivalSheetScreenProps {
  data: DisplayArrivalsInput;
  onLocationClick?: (pin: LocationPin) => void;
  lastRefreshedAt?: number | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function ArrivalSheetScreen({
  data,
  onLocationClick,
  lastRefreshedAt,
  onRefresh,
  isRefreshing,
}: ArrivalSheetScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}
      contentContainerStyle={styles.content}
    >
      <ArrivalCard
        data={data}
        onLocationClick={onLocationClick}
        lastRefreshedAt={lastRefreshedAt}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
});
