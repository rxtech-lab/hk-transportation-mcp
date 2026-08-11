import type { Metadata } from "next";
import { PrivacyView } from "@/components/privacy-view";

export const metadata: Metadata = {
  title: "Privacy Policy — HK Transportation",
  description:
    "How the HK Transportation web and mobile apps handle your location, chat messages, and device data.",
  openGraph: {
    title: "Privacy Policy — HK Transportation",
    description:
      "How the HK Transportation web and mobile apps handle your location, chat messages, and device data.",
    type: "article",
    siteName: "HK Transportation",
  },
};

export default function PrivacyPage() {
  return <PrivacyView />;
}
