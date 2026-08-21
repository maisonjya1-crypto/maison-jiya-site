import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./enhancements.css";
import "./carrier-mode.css";
import "./storefront-cms.css";
import PlatformEnhancements from "./platform-enhancements";
import CarrierModeEnhancement from "./carrier-mode-enhancement";
import StorefrontCmsEnhancement from "./storefront-cms-enhancement";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maison Jiya — Pilotage",
  description: "Commandes, colis, clients, publicité et rentabilité réunis au même endroit.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/maison-jiya-logo.jpeg",
    shortcut: "/maison-jiya-logo.jpeg",
    apple: "/maison-jiya-logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <PlatformEnhancements />
        <CarrierModeEnhancement />
        <StorefrontCmsEnhancement />
      </body>
    </html>
  );
}
