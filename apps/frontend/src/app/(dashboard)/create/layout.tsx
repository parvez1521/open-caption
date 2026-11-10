import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Creator Studio",
  description: "Content ideas, hooks and caption suggestions from a built-in pattern engine, with an optional model that runs on your own device.",
  path: "/create",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
