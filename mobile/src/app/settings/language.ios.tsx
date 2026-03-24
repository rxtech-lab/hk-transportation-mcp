import { Host, List, Section, Button, HStack, Text, Image } from "@expo/ui/swift-ui";
import { listStyle } from "@expo/ui/swift-ui/modifiers";
import { useI18n, locales } from "@/lib/i18n/i18n-provider";

export default function LanguageScreen() {
  const { locale, setLocale } = useI18n();

  return (
    <Host style={{ flex: 1, marginTop: 100 }}>
      <List modifiers={[listStyle("insetGrouped")]}>
        <Section>
          {locales.map((item) => {
            const selected = item.code === locale;
            return (
              <Button key={item.code} onPress={() => setLocale(item.code)}>
                <HStack>
                  <Text weight={selected ? "semibold" : "regular"} color={selected ? "blue" : "primary"}>
                    {item.label}
                  </Text>
                  {selected && (
                    <>
                      <Image systemName="checkmark" color="blue" size={16} />
                    </>
                  )}
                </HStack>
              </Button>
            );
          })}
        </Section>
      </List>
    </Host>
  );
}
