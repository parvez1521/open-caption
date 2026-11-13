import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** The page itself is a client component, so its metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description: "Sign in to Captionit, or create a free account, to pick up your caption projects, brand kit and exports.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
