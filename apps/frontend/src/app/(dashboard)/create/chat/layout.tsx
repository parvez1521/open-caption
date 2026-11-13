import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "AI Studio Chat",
  description: "Chat with structured answers: ideas, hooks, scripts, shot lists, calendars, carousels and captions. Saved to your content library.",
  path: "/create/chat",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
