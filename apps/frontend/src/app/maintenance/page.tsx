import type { Metadata } from "next";
import { MaintenancePage } from "@/components/maintenance/MaintenancePage";

export const metadata: Metadata = {
  title: "Down for maintenance",
  description: "Captionit is down for planned maintenance. Please check back soon.",
  robots: { index: false, follow: false },
};

/** Direct preview of the maintenance holding page; the root layout shows
 * this same page on every route while MAINTENANCE_MODE=true. */
export default function MaintenancePreviewPage() {
  return <MaintenancePage />;
}
