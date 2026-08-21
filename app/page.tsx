import "./globals.css";
import "./enhancements.css";
import "./carrier-mode.css";
import "./storefront-cms.css";
import "./storefront-cms-v2.css";
import "./best-seller-cms.css";
import "./private-pwa.css";
import DashboardClient from "./dashboard-client";
import PlatformEnhancements from "./platform-enhancements";
import CarrierModeEnhancement from "./carrier-mode-enhancement";
import StorefrontCmsV2Enhancement from "./storefront-cms-v2-enhancement";
import BestSellerCmsEnhancement from "./best-seller-cms-enhancement";
import PrivatePwa from "./private-pwa";

export default function Home() {
  return <>
    <DashboardClient />
    <PlatformEnhancements />
    <CarrierModeEnhancement />
    <StorefrontCmsV2Enhancement />
    <BestSellerCmsEnhancement />
    <PrivatePwa />
  </>;
}
