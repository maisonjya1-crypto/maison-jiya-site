import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./enhancements.css";
import "./carrier-mode.css";
import "./storefront-cms.css";
import "./storefront-cms-v2.css";
import "./best-seller-cms.css";
import "./private-pwa.css";
import "./private-pwa-android.css";
import "./mobile-native.css";
import "./private-ios.css";
import "./private-ui-v3.css";
import DashboardClient from "./dashboard-client";
import PlatformEnhancements from "./platform-enhancements";
import CarrierModeEnhancement from "./carrier-mode-enhancement";
import StorefrontCmsV2Enhancement from "./storefront-cms-v2-enhancement";
import BestSellerCmsEnhancement from "./best-seller-cms-enhancement";
import PrivatePwa from "./private-pwa";
import PrivateUiV3Enhancement from "./private-ui-v3-enhancement";

export const metadata: Metadata = {
  title: "Maison Jiya Gestion",
  description: "Application privée Maison Jiya : commandes, stock, partenaires et pilotage de la boutique publique.",
  applicationName: "Maison Jiya Gestion",
  manifest: "/maison-jiya-gestion.webmanifest?v=3",
  icons: {
    icon: [
      { url: "/jiya-gestion-192.png", sizes: "192x192", type: "image/png" },
      { url: "/jiya-gestion-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/jiya-gestion-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jiya Gestion",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2d2430",
};

export default function Home() {
  return <>
    <DashboardClient />
    <PlatformEnhancements />
    <CarrierModeEnhancement />
    <StorefrontCmsV2Enhancement />
    <BestSellerCmsEnhancement />
    <PrivatePwa />
    <PrivateUiV3Enhancement />
  </>;
}
