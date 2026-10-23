import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Mory · Mỗi kỷ niệm, một câu chuyện",
    template: "%s · Mory",
  },
  description:
    "Cất giữ hành trình lớn khôn của con, từ những ngày mong chờ đến từng bước trưởng thành.",
  applicationName: "Mory",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Mory" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7962AB",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers(); // Nonce CSP requires dynamic rendering on every HTML response.
  return (
    <html lang="vi" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
