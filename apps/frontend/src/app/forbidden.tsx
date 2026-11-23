import type { Metadata } from "next";
import { ForbiddenState } from "@/components/ui/StateMessages";

export const metadata: Metadata = {
  title: "Access denied",
  description: "You don't have access to this page on Captionit.",
  robots: { index: false, follow: false },
};

/**
 * 403 state (production-pages audit). Next renders this when a segment
 * calls forbidden() — for example a guest hitting a signed-in-only surface.
 * It names no protected resource, only the next step.
 */
export default function Forbidden() {
  return <ForbiddenState />;
}
