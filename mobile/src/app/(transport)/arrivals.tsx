import { use } from "react";
import { ScrollView, Pressable, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/use-theme";
import { ArrivalCard } from "@/components/arrivals/ArrivalCard";
import { ArrivalsSheetContext } from "./_ctx";

export default function ArrivalsSheet() {
  const theme = useTheme();
  const router = useRouter();
  const { sheetData } = use(ArrivalsSheetContext);

  if (!sheetData) return null;

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}
        contentContainerStyle={styles.content}
      >
        <ArrivalCard
          data={sheetData.data}
          onLocationClick={sheetData.onLocationClick}
          lastRefreshedAt={sheetData.lastRefreshedAt}
          onRefresh={sheetData.onRefresh}
          isRefreshing={sheetData.isRefreshing}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
});
