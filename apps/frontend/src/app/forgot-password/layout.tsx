import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Reset your password",
  description: "Request a password reset link for your Open Caption account.",
  path: "/forgot-password",
  index: false,
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
