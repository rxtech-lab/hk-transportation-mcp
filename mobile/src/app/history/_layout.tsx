import { Stack } from "expo-router";
import { useDictionary } from "@/lib/i18n/i18n-provider";

export default function HistoryLayout() {
  const dict = useDictionary();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: "#09090b" },
      }}
    >
      <Stack.Screen name="index" options={{ title: dict.history.title }} />
    </Stack>
  );
}
