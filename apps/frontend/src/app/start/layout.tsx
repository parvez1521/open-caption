import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * /start is a sign-in/guest redirect hub with no content of its own — it gets
 * a proper title but stays out of the index and out of the sitemap.
 */
export const metadata: Metadata = pageMetadata({
  title: "Opening your studio",
  description: "Captionit is opening your studio.",
  path: "/start",
  index: false,
});

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
