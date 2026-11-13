import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/** App page behind the dashboard shell: unique title, never indexed. The page itself is a client component, so metadata lives here. */
export const metadata: Metadata = pageMetadata({
  title: "Transcribe",
  description: "Upload a video or audio file. Get its transcript, in your browser.",
  path: "/transcribe",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
