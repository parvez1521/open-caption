import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind the dashboard shell: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "AI Clipper",
  description: "Turn a long captioned video into ranked short clips. Scores are compared across the whole video.",
  path: "/ai-clipper",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
