import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Video Editor",
  description: "The Open Caption video editor.",
  path: "/editor",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
