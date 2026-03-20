import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n, locales } from "@/lib/i18n/i18n-provider";
import { useTheme } from "@/hooks/use-theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { locale } = useI18n();
  const theme = useTheme();

  const currentLabel = locales.find((l) => l.code === locale)?.label ?? locale;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
        <Pressable
          onPress={() => router.push("/settings/language")}
          style={styles.row}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="language" size={20} color={theme.textTertiary} />
            <Text style={[styles.rowLabel, { color: theme.text }]}>Language</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowValue, { color: theme.textTertiary }]}>{currentLabel}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </View>
        </Pressable>
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
