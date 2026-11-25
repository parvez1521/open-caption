import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here.
 * While AI Edit is hidden (owner order 2026-11-25) this route redirects to /dashboard, so the title below never
 * renders user-visible — it names the Dashboard, not AI Edit, so a stray render cannot leak the hidden surface. */
export const metadata: Metadata = pageMetadata({
  title: "Projects",
  description: "This page has moved — your projects are on the Dashboard.",
  path: "/dashboard",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
