import { createContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { I18nProvider, useDictionary } from "@/lib/i18n/i18n-provider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const TabBarContext = createContext<{
  setIsTabBarHidden: (hidden: boolean) => void;
}>({
  setIsTabBarHidden: () => {},
});

function AppTabs() {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);
  const dict = useDictionary();

  return (
    <TabBarContext value={{ setIsTabBarHidden }}>
      <NativeTabs hidden={isTabBarHidden}>
        <NativeTabs.Trigger name="(transport)">
          <NativeTabs.Trigger.Label>{dict.tabs.transport}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="bus.fill" md="directions_bus" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="history">
          <NativeTabs.Trigger.Label>{dict.tabs.history}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Label>{dict.tabs.settings}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gear" md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </TabBarContext>
  );
}

export default function RootLayout() {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") {
        focusManager.setFocused(status === "active");
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <ThemeProvider value={DarkTheme}>
            <AppTabs />
          </ThemeProvider>
        </I18nProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
