import { View, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguageList } from "@/components/ui/LanguageSwitcher";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function LanguageScreen() {
  const theme = useTheme();
  const { dict } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 44 }]}>
      <Stack.Screen
        options={{
          title: dict.settings.language,
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
