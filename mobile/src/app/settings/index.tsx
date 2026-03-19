import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n, locales } from "@/lib/i18n/i18n-provider";

export default function SettingsScreen() {
  const router = useRouter();
  const { locale } = useI18n();

  const currentLabel = locales.find((l) => l.code === locale)?.label ?? locale;

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Pressable
          onPress={() => router.push("/settings/language")}
          style={styles.row}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="language" size={20} color="#a1a1aa" />
            <Text style={styles.rowLabel}>Language</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{currentLabel}</Text>
            <Ionicons name="chevron-forward" size={18} color="#71717a" />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    padding: 16,
  },
  section: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
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
    color: "#e4e4e7",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rowValue: {
    fontSize: 15,
    color: "#71717a",
  },
});
