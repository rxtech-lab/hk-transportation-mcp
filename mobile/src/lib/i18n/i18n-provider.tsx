import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import enUS from "./dictionaries/en-US";
import zhHK from "./dictionaries/zh-HK";
import zhTW from "./dictionaries/zh-TW";
import zhCN from "./dictionaries/zh-CN";

export interface Dictionary {
  landing: {
    readonly title: string;
    readonly subtitle: string;
    readonly suggestions: readonly string[];
    readonly continueChat: string;
    readonly greetingMorning: string;
    readonly greetingAfternoon: string;
    readonly greetingEvening: string;
  };
  chat: {
    readonly headerTitle: string;
    readonly newChat: string;
    readonly inputPlaceholder: string;
    readonly errorFallback: string;
    readonly map: string;
    readonly view: string;
    readonly stop: string;
    readonly stops: string;
    readonly route: string;
    readonly routes: string;
    readonly locationDenied: string;
    readonly locationSettings: string;
    readonly voiceTitle: string;
    readonly voiceHint: string;
    readonly voiceListening: string;
    readonly voiceTapToResume: string;
    readonly voiceDone: string;
    readonly voiceCancel: string;
    readonly voicePermission: string;
    readonly voiceUnavailable: string;
  };
  settings: {
    readonly language: string;
    readonly location: string;
    readonly locationOn: string;
    readonly locationOff: string;
    readonly locationNotSet: string;
    readonly privacyPolicy: string;
    readonly termsConditions: string;
    readonly version: string;
  };
  map: {
    readonly title: string;
  };
  tabs: {
    readonly transport: string;
    readonly nearby: string;
    readonly settings: string;
    readonly history: string;
  };
  nearby: {
    readonly title: string;
    readonly empty: string;
    readonly locationDenied: string;
    readonly locationSettings: string;
    readonly loading: string;
  };
  history: {
    readonly title: string;
    readonly chatHistory: string;
    readonly trackingHistory: string;
    readonly empty: string;
    readonly trackingEmpty: string;
    readonly trackingCount: string;
    readonly delete: string;
    readonly untitled: string;
  };
}

export type Locale = "en-US" | "zh-HK" | "zh-TW" | "zh-CN";

export const locales: { code: Locale; label: string }[] = [
  { code: "zh-HK", label: "繁體中文（香港）" },
  { code: "zh-TW", label: "繁體中文（台灣）" },
  { code: "zh-CN", label: "简体中文" },
  { code: "en-US", label: "English" },
];

const dictionaries: Record<Locale, Dictionary> = {
  "en-US": enUS,
  "zh-HK": zhHK,
  "zh-TW": zhTW,
  "zh-CN": zhCN,
};

const STORAGE_KEY = "locale";

function resolveLocale(languageTag: string): Locale {
  const lower = languageTag.toLowerCase();
  if (lower === "zh-hk" || lower === "zh-hant-hk") return "zh-HK";
  if (lower === "zh-tw" || lower === "zh-hant-tw") return "zh-TW";
  if (lower.startsWith("zh-hant")) return "zh-HK";
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("en")) return "en-US";
  return "en-US";
}

interface I18nContextValue {
  dict: Dictionary;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en-US");

  useEffect(() => {
    (async () => {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as Locale | null;
      if (stored && dictionaries[stored]) {
        setLocaleState(stored);
      } else {
        const deviceLocales = getLocales();
        const tag = deviceLocales[0]?.languageTag ?? "en-US";
        setLocaleState(resolveLocale(tag));
      }
    })();
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const dict = dictionaries[locale];

  return (
    <I18nContext.Provider value={{ dict, locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useDictionary() {
  return useI18n().dict;
}

/**
 * Returns a function that picks the localized stop name based on the current locale.
 */
export function useLocalizedStopName() {
  const { locale } = useI18n();
  return (stop: { name_en?: string; name_tc?: string; name_sc?: string; name?: string }) => {
    switch (locale) {
      case "zh-HK":
      case "zh-TW":
        return stop.name_tc || stop.name_en || stop.name || "";
      case "zh-CN":
        return stop.name_sc || stop.name_en || stop.name || "";
      default:
        return stop.name_en || stop.name || "";
    }
  };
}

/**
 * Returns a function that picks the localized destination based on the current locale.
 */
export function useLocalizedDestination() {
  const { locale } = useI18n();
  return (arrival: { destination?: string; dest_tc?: string; dest_sc?: string }) => {
    switch (locale) {
      case "zh-HK":
      case "zh-TW":
        return arrival.dest_tc || arrival.destination || "";
      case "zh-CN":
        return arrival.dest_sc || arrival.destination || "";
      default:
        return arrival.destination || "";
    }
  };
}
