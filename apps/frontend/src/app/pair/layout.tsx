import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Pair a computer",
  description: "Confirm pairing a computer with your Captionit account.",
  path: "/pair",
  index: false,
});

export default function PairLayout({ children }: { children: React.ReactNode }) {
  return children;
}
