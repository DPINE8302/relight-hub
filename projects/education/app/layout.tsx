import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import OfflineReady from "./OfflineReady";
import Collector from "./analytics/Collector";
import Notice from "./analytics/Notice";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol = forwardedProtocol || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "RE;light · รู้ทันบุหรี่ไฟฟ้า";
  const description =
    "ข้อมูลบุหรี่ไฟฟ้า นิโคติน ผลกระทบ ความเชื่อ กฎหมายไทย และบริการช่วยเลิก จากแหล่งข้อมูลทางการของประเทศไทย";

  return {
    title,
    description,
    applicationName: "RE;light",
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    keywords: [
      "บุหรี่ไฟฟ้า",
      "นิโคติน",
      "เยาวชน",
      "Quitline 1600",
      "RE;light",
      "NoNic-Smart Gen",
    ],
    openGraph: {
      type: "website",
      locale: "th_TH",
      title,
      description,
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "พรุ่งนี้ยังเป็นของคุณ · RE;light" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#070b17",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body><OfflineReady /><Collector />{children}<Notice /></body>
    </html>
  );
}
