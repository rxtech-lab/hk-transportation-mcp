import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { LanguageList } from "@/components/ui/LanguageSwitcher";
import { useTheme } from "@/hooks/use-theme";

export default function LanguageScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <Stack.Screen
        options={{
          title: "Language",
          headerStyle: { backgroundColor: theme.headerBackground },
          headerTintColor: theme.headerTint,
        }}
      />
      <LanguageList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});
