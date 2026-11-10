import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Caption Studio",
  description: "Caption projects and transcripts in your Open Caption workspace.",
  path: "/captions",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
