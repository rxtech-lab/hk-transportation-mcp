"use client";

import { createContext, useContext, useState, useEffect, startTransition, type ReactNode } from "react";
import enUS from "./dictionaries/en-US";
import zhHK from "./dictionaries/zh-HK";
import zhTW from "./dictionaries/zh-TW";
import zhCN from "./dictionaries/zh-CN";

export interface Dictionary {
  landing: {
    readonly title: string;
    readonly subtitle: string;
    readonly suggestions: readonly string[];
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
  };
  map: {
    readonly title: string;
    readonly missingToken: string;
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

function resolveLocale(browserLang: string): Locale {
  const lower = browserLang.toLowerCase();
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
    startTransition(() => {
      if (stored && dictionaries[stored]) {
        setLocaleState(stored);
      } else {
        setLocaleState(resolveLocale(navigator.language));
      }
      setMounted(true);
    });
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.lang = locale.startsWith("zh") ? "zh" : "en";
    }
  }, [locale, mounted]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  // Avoid hydration mismatch — render with en-US on server, then switch client-side
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
