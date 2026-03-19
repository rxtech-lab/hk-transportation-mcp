import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { LanguageList } from "@/components/ui/LanguageSwitcher";

export default function LanguageScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: "Language",
          headerStyle: { backgroundColor: "#09090b" },
          headerTintColor: "#fff",
        }}
      />
      <LanguageList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    padding: 16,
  },
});
