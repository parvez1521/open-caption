import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * App page behind sign-in: unique title, never indexed. The page itself is a
 * client component, so metadata lives here. Without this the route inherited
 * the homepage title/description and was crawlable — byte-duplicating the
 * homepage in the index.
 */
export const metadata: Metadata = pageMetadata({
  title: "Onboarding",
  description: "Two quick questions, then your Captionit dashboard opens.",
  path: "/onboarding",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
