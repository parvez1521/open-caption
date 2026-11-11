import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind sign-in: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Teleprompter",
  description: "Read your script while you record, at your pace.",
  path: "/prompter",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
