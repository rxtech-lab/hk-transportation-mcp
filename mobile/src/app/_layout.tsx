import { createContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { ThemeProvider, DarkTheme } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

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

export default function RootLayout() {
  const [isTabBarHidden, setIsTabBarHidden] = useState(false);

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
            <TabBarContext value={{ setIsTabBarHidden }}>
              <NativeTabs hidden={isTabBarHidden}>
                <NativeTabs.Trigger name="index">
                  <NativeTabs.Trigger.Label>Transport</NativeTabs.Trigger.Label>
                  <NativeTabs.Trigger.Icon sf="bus.fill" md="directions_bus" />
                </NativeTabs.Trigger>
                <NativeTabs.Trigger name="settings">
                  <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
                  <NativeTabs.Trigger.Icon sf="gear" md="settings" />
                </NativeTabs.Trigger>
              </NativeTabs>
            </TabBarContext>
          </ThemeProvider>
        </I18nProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
