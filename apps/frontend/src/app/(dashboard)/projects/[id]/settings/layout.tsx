import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Project settings",
  description: "Details, export defaults and danger zone for one Open Caption project.",
  path: "/projects",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
