import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n, locales, type Locale } from "@/lib/i18n/i18n-provider";

export function LanguageList() {
  const { locale, setLocale } = useI18n();

  return (
    <View style={styles.list}>
      {locales.map((item) => {
        const selected = item.code === locale;
        return (
          <Pressable
            key={item.code}
            onPress={() => setLocale(item.code)}
            style={[styles.row, selected && styles.rowSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {item.label}
            </Text>
            {selected && (
              <Ionicons name="checkmark" size={20} color="#3b82f6" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rowSelected: {
    backgroundColor: "rgba(59,130,246,0.08)",
  },
  label: {
    fontSize: 16,
    color: "#e4e4e7",
  },
  labelSelected: {
    color: "#3b82f6",
    fontWeight: "600",
  },
});
