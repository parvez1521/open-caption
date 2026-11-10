import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The pages themselves are client components, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Motion Studio",
  description: "Animated motion graphics for your videos in your Open Caption workspace — customise a template and add it to a project.",
  path: "/motion",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
