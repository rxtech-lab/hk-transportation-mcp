import { use } from "react";
import { ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundSecondary }]} edges={["top"]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
});
