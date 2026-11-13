import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * App page behind sign-in: unique title, never indexed. The page itself is a
 * client component, so metadata lives here (it used to inherit the Settings
 * title).
 */
export const metadata: Metadata = pageMetadata({
  title: "Billing",
  description: "Your Captionit plan, payments and billing history.",
  path: "/settings/billing",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
