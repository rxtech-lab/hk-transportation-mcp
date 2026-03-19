/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundSecondary: '#f2f2f7',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    textTertiary: '#8E8E93',
    separator: 'rgba(60,60,67,0.12)',
    separatorLight: 'rgba(60,60,67,0.06)',
    cardBackground: 'rgba(242,242,247,0.95)',
    inputBackground: 'rgba(118,118,128,0.12)',
    headerBackground: '#ffffff',
    headerTint: '#000000',
    headerBlurEffect: 'light' as const,
    chevronColor: 'rgba(60,60,67,0.3)',
    codeBackground: 'rgba(0,0,0,0.05)',
    codeBorder: 'rgba(0,0,0,0.08)',
    tableHeaderBackground: 'rgba(0,0,0,0.03)',
    toolPendingBackground: 'rgba(0,0,0,0.04)',
    sheetBackground: '#f2f2f7',
    sheetHandle: 'rgba(60,60,67,0.3)',
    routeBadgeBg: 'rgba(0,0,0,0.06)',
    routeBadgeText: '#000000',
    mapLabelBg: 'rgba(242,242,247,0.8)',
    mapLabelText: 'rgba(0,0,0,0.9)',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundSecondary: '#09090b',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    textTertiary: '#8E8E93',
    separator: 'rgba(84,84,88,0.65)',
    separatorLight: 'rgba(255,255,255,0.06)',
    cardBackground: 'rgba(30,30,30,0.95)',
    inputBackground: 'rgba(118,118,128,0.12)',
    headerBackground: '#09090b',
    headerTint: '#ffffff',
    headerBlurEffect: 'dark' as const,
    chevronColor: 'rgba(235,235,245,0.3)',
    codeBackground: 'rgba(255,255,255,0.08)',
    codeBorder: 'rgba(255,255,255,0.06)',
    tableHeaderBackground: 'rgba(255,255,255,0.03)',
    toolPendingBackground: 'rgba(255,255,255,0.04)',
    sheetBackground: '#18181b',
    sheetHandle: 'rgba(255,255,255,0.3)',
    routeBadgeBg: 'rgba(255,255,255,0.08)',
    routeBadgeText: '#ffffff',
    mapLabelBg: 'rgba(24,24,27,0.8)',
    mapLabelText: 'rgba(255,255,255,0.9)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
