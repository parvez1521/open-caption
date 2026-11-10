import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Media Library",
  description: "Media files imported into your Open Caption projects, stored in this browser on this device.",
  path: "/library",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
