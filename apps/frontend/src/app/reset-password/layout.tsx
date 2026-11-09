import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Set a new password",
  description: "Choose a new password for your Open Caption account.",
  path: "/reset-password",
  index: false,
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
