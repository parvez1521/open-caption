import type { Metadata } from "next";
import { getMotionTemplate } from "@capseasy/motion";
import { pageMetadata } from "@/lib/seo";

/**
 * Per-template metadata for Motion Studio customize pages. Still noindex —
 * these are app pages behind sign-in, like /motion itself — but each one now
 * carries its own title instead of inheriting the generic "Motion Studio".
 * Unknown template ids fall back to the generic title.
 */
export async function generateMetadata({ params }: { params: Promise<{ templateId: string }> }): Promise<Metadata> {
  const { templateId } = await params;
  const template = getMotionTemplate(templateId);
  return pageMetadata({
    title: template ? `${template.title} · Motion Studio` : "Motion Studio",
    description: template?.description ?? "Customize an animated motion graphic for your video.",
    path: `/motion/${templateId}`,
    index: false,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
