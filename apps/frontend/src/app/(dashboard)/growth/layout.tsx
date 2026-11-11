import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Growth Studio",
  description: "Connect your accounts and ask the Growth Coach about your own posts.",
  path: "/growth",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
