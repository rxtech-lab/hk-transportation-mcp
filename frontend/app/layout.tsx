import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { I18nProvider } from "@/lib/i18n/i18n-provider";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HK Transportation",
  description:
    "Your AI-powered Hong Kong bus transportation assistant. Ask about bus routes, nearby stops, and real-time arrival times.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HK Transport",
  },
  openGraph: {
    title: "HK Transportation",
    description:
      "Your AI-powered Hong Kong bus transportation assistant. Ask about bus routes, nearby stops, and real-time arrival times.",
    type: "website",
    siteName: "HK Transportation",
  },
  twitter: {
    card: "summary_large_image",
    title: "HK Transportation",
    description:
      "Your AI-powered Hong Kong bus transportation assistant.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased dark",
        inter.variable,
        geistMono.variable,
        "font-sans"
      )}
    >
      <body className="min-h-[100dvh] flex flex-col bg-zinc-950 text-white overscroll-none">
        <Providers>
          <I18nProvider>{children}</I18nProvider>
        </Providers>
      </body>
    </html>
  );
}
